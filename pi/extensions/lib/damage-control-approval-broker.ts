import { createServer, createConnection } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { ExtensionContext } from "@mariozechner/pi-coding-agent"

const SOCKET_ENV = "PI_DAMAGE_CONTROL_APPROVAL_SOCKET"
const TOKEN_ENV = "PI_DAMAGE_CONTROL_APPROVAL_TOKEN"
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const INCOMPLETE_REQUEST_TIMEOUT_MS = 10 * 1000
const MAX_REQUEST_BYTES = 64 * 1024

type ApprovalRequest = {
  token: string
  category: string
  matched: string
  subject: string
}

type ApprovalResponse = {
  approved?: boolean
  error?: string
}

export type DamageControlRisk = {
  category: string
  matched: string
  subject: string
}

export type ApprovalBroker = {
  env: NodeJS.ProcessEnv
  close: () => Promise<void>
}

type ApprovalState = {
  active: boolean
  id: string
  label: string
}

type ApprovalBrokerOptions = {
  requestApproval: (request: DamageControlRisk) => Promise<boolean>
  onApprovalStateChange?: (state: ApprovalState) => void
}

function parseMessage<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function reportApprovalState(
  callback: ApprovalBrokerOptions["onApprovalStateChange"],
  state: ApprovalState,
): void {
  try {
    callback?.(state)
  } catch {
    // Status reporting must never prevent or strand an approval response.
  }
}

export async function createApprovalBroker(
  ctx: ExtensionContext,
  options: ApprovalBrokerOptions,
): Promise<ApprovalBroker> {
  const dir = await mkdtemp(join(tmpdir(), "pi-damage-control-approval-"))
  const socketPath = join(dir, "broker.sock")
  const token = randomUUID()
  let confirmationQueue = Promise.resolve()
  let closing = false
  const sockets = new Set<ReturnType<typeof createConnection>>()

  const server = createServer((socket) => {
    sockets.add(socket)
    let buffer = ""
    let handled = false
    let cancelled = false
    let approvalState: { id: string; label: string } | undefined
    let approvalStateFinished = false
    const finishApprovalState = () => {
      if (!approvalState || approvalStateFinished) return
      approvalStateFinished = true
      reportApprovalState(options.onApprovalStateChange, {
        active: false,
        ...approvalState,
      })
    }
    const incompleteRequestTimeout = setTimeout(() => {
      if (!handled) socket.destroy(new Error("Incomplete approval request timed out"))
    }, INCOMPLETE_REQUEST_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(incompleteRequestTimeout)
      sockets.delete(socket)
      cancelled = true
      finishApprovalState()
    }
    socket.on("close", cleanup)
    socket.on("error", cleanup)

    socket.on("data", (chunk) => {
      if (handled) return
      buffer += chunk.toString()
      if (Buffer.byteLength(buffer, "utf8") > MAX_REQUEST_BYTES) {
        handled = true
        socket.end(`${JSON.stringify({ error: "Approval request is too large" })}\n`)
        return
      }

      const newline = buffer.indexOf("\n")
      if (newline === -1) return
      handled = true
      clearTimeout(incompleteRequestTimeout)

      const request = parseMessage<ApprovalRequest>(buffer.slice(0, newline))

      const respond = (response: ApprovalResponse) => {
        if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`)
      }

      if (!request || request.token !== token) {
        respond({ error: "Invalid damage-control approval request" })
        return
      }

      const label = `${request.category}: ${request.subject}`
      approvalState = { id: randomUUID(), label }
      reportApprovalState(options.onApprovalStateChange, {
        active: true,
        ...approvalState,
      })
      confirmationQueue = confirmationQueue
        .then(async () => {
          try {
            if (cancelled || closing || socket.destroyed) return
            if (!ctx.hasUI) {
              respond({ error: "No parent UI is available for human approval" })
              return
            }

            try {
              const approved = await options.requestApproval(request)
              respond({ approved })
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error)
              respond({ error: `Approval failed: ${detail}` })
            }
          } finally {
            finishApprovalState()
          }
        })
        .catch((error) => {
          const detail = error instanceof Error ? error.message : String(error)
          respond({ error: `Approval failed: ${detail}` })
        })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(socketPath, () => {
      server.off("error", reject)
      resolve()
    })
  })

  return {
    env: {
      ...process.env,
      [SOCKET_ENV]: socketPath,
      [TOKEN_ENV]: token,
    },
    close: async () => {
      closing = true
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    },
  }
}

export async function requestParentApproval(risk: DamageControlRisk): Promise<ApprovalResponse | undefined> {
  const socketPath = process.env[SOCKET_ENV]
  const token = process.env[TOKEN_ENV]
  if (!socketPath || !token) return undefined

  return new Promise<ApprovalResponse>((resolve) => {
    const socket = createConnection(socketPath)
    let settled = false
    let buffer = ""

    const finish = (response: ApprovalResponse) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      resolve(response)
    }

    const timeout = setTimeout(
      () => finish({ error: "Timed out waiting for parent approval" }),
      REQUEST_TIMEOUT_MS,
    )

    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ token, ...risk })}\n`)
    })
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      const newline = buffer.indexOf("\n")
      if (newline === -1) return
      finish(parseMessage<ApprovalResponse>(buffer.slice(0, newline)) ?? { error: "Invalid approval response" })
    })
    socket.on("error", (error) => finish({ error: error.message }))
    socket.on("end", () => {
      if (!settled) finish({ error: "Parent approval broker closed without a response" })
    })
  })
}
