import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { existsSync, readdirSync, readFileSync } from "fs"
import { createConnection } from "net"
import { homedir } from "os"
import { basename, join } from "path"

const CMUX_SOCK = "/tmp/cmux.sock"
const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock"
const IDLE_DEBOUNCE_MS = 1500
const QUESTION_TOOLS = new Set(["question", "ask_user_question", "askuserquestion"])

function isCmux(): boolean {
  return existsSync(CMUX_SOCK)
}

function resolveKittySession(): string | undefined {
  const cwd = process.cwd()
  const home = homedir()
  const sessionsDir = join(home, ".config", "kitty", "sessions")

  try {
    const files = readdirSync(sessionsDir).filter(
      (f: string) => f.endsWith(".kitty-session") && f !== "template.kitty-session",
    )
    for (const file of files) {
      const content = readFileSync(join(sessionsDir, file), "utf-8")
      const cdLine = content.split("\n").find((l: string) => l.startsWith("cd "))
      if (!cdLine) continue
      const sessionDir = cdLine.slice(3).trim().replace(/^~/, home)
      if (cwd === sessionDir || cwd.startsWith(sessionDir + "/")) {
        return basename(file, ".kitty-session")
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

type KittyNotificationType = "idle" | "input" | "permission"

function resolveKittyWindowId(): number | undefined {
  const raw = process.env.KITTY_WINDOW_ID
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function notifyKitty(
  sessionName: string | undefined,
  type: KittyNotificationType,
  message: string,
  windowId?: number,
): void {
  const payload = JSON.stringify({
    type: "notify",
    session_name: sessionName ?? "",
    notification_type: type,
    message,
    ...(windowId !== undefined ? { window_id: windowId } : {}),
  })

  try {
    const socket = createConnection(KITTY_SIDEBAR_SOCK)
    socket.setTimeout(2000)
    socket.on("connect", () => {
      socket.write(`${payload}\n`)
      socket.end()
    })
    socket.on("error", () => { try { socket.destroy() } catch {} })
    socket.on("timeout", () => { try { socket.destroy() } catch {} })
  } catch {
    // silent — notification is best-effort
  }
}

async function notify(
  $: PluginInput["$"],
  kittySessionName: string | undefined,
  kittyWindowId: number | undefined,
  kittyType: KittyNotificationType,
  title: string,
  body: string,
  subtitle?: string,
): Promise<void> {
  if (existsSync(KITTY_SIDEBAR_SOCK)) {
    notifyKitty(kittySessionName, kittyType, body, kittyWindowId)
    return
  }

  try {
    if (subtitle) {
      await $`cmux notify --title ${title} --body ${body} --subtitle ${subtitle}`
    } else {
      await $`cmux notify --title ${title} --body ${body}`
    }
  } catch {
    // cmux not available or command failed — silent
  }
}

/**
 * Extract sessionID from any event's properties.
 * Events use different property shapes, but sessionID is always at
 * properties.sessionID or properties.info.sessionID.
 */
function getEventSessionID(event: { type: string; properties?: any }): string | undefined {
  const props = event.properties
  if (!props) return undefined
  if (typeof props.sessionID === "string") return props.sessionID
  if (typeof props.info?.sessionID === "string") return props.info.sessionID
  if (typeof props.info?.id === "string") return props.info.id
  return undefined
}

/**
 * Check if a session.status event represents an idle transition.
 * OpenCode sometimes sends session.status(idle) instead of / in addition to
 * session.idle. oh-my-opencode normalizes these internally; we do the same.
 */
function isIdleStatusEvent(event: { type: string; properties?: any }): boolean {
  if (event.type !== "session.status") return false
  return event.properties?.status?.type === "idle"
}

export const TerminalNotifyPlugin: Plugin = async ({ $ }) => {
  const hasDaemon = existsSync(KITTY_SIDEBAR_SOCK)
  if (!isCmux() && !hasDaemon) return {}

  const kittySessionName = hasDaemon ? resolveKittySession() : undefined
  const kittyWindowId = hasDaemon ? resolveKittyWindowId() : undefined

  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let idleSessionID: string | null = null
  let mainSessionID: string | null = null

  function startIdleTimer(sessionID: string | undefined) {
    if (idleTimer) clearTimeout(idleTimer)
    idleSessionID = sessionID ?? null

    idleTimer = setTimeout(() => {
      idleTimer = null
      idleSessionID = null
      notify($, kittySessionName, kittyWindowId, "idle", "OpenCode", "Agent is ready for input")
    }, IDLE_DEBOUNCE_MS)
  }

  function cancelIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
      idleSessionID = null
    }
  }

  return {
    event: async ({ event }) => {
      const eventSessionID = getEventSessionID(event)

      if (event.type === "session.created") {
        const hasParent = !!event.properties?.info?.parentID
        if (!hasParent && eventSessionID) {
          mainSessionID = eventSessionID
        }
      }

      if (event.type === "session.idle" || isIdleStatusEvent(event)) {
        if (mainSessionID && eventSessionID && eventSessionID !== mainSessionID) return
        startIdleTimer(eventSessionID)
        return
      }

      if (event.type === "session.status" && !isIdleStatusEvent(event)) {
        if (idleTimer && idleSessionID && eventSessionID === idleSessionID) {
          cancelIdleTimer()
        }
      }
    },

    "tool.execute.before": async (input) => {
      const toolName = input.tool?.toLowerCase()
      if (toolName && QUESTION_TOOLS.has(toolName)) {
        notify($, kittySessionName, kittyWindowId, "input", "OpenCode", "Agent is asking a question", "Input Needed")
      }
    },

    "permission.ask": async (input, output) => {
      // Only notify when human action is actually needed.
      // damage-control runs before us and auto-approves safe commands,
      // so if status is still "ask" here, it genuinely needs attention.
      if (output.status !== "ask") return

      cancelIdleTimer()

      const description =
        input.type === "bash" && typeof input.metadata?.command === "string"
          ? input.metadata.command
          : input.title || input.type

      notify(
        $,
        kittySessionName,
        kittyWindowId,
        "permission",
        "OpenCode",
        String(description),
        "Permission Required",
      )
    },

  }
}
