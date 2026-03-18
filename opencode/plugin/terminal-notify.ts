import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { appendFileSync, existsSync, readdirSync, readFileSync } from "fs"
import { createConnection } from "net"
import { homedir } from "os"
import { basename, join } from "path"

const DEBUG_LOG = "/tmp/terminal-notify-debug.log"
function debug(msg: string) {
  appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`)
}

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

function notifyKitty(
  sessionName: string | undefined,
  type: KittyNotificationType,
  message: string,
): void {
  const payload = JSON.stringify({
    type: "notify",
    session_name: sessionName ?? "",
    notification_type: type,
    message,
  })
  debug(`sending: ${payload}`)

  try {
    const socket = createConnection(KITTY_SIDEBAR_SOCK)
    socket.setTimeout(2000)
    socket.on("connect", () => {
      socket.write(`${payload}\n`)
      socket.end()
    })
    socket.on("error", (err) => {
      debug(`socket error: ${err}`)
      try { socket.destroy() } catch {}
    })
    socket.on("timeout", () => {
      debug("socket timeout")
      try { socket.destroy() } catch {}
    })
  } catch (err) {
    debug(`connect error: ${err}`)
  }
}

async function notify(
  $: PluginInput["$"],
  kittySessionName: string | undefined,
  kittyType: KittyNotificationType,
  title: string,
  body: string,
  subtitle?: string,
): Promise<void> {
  if (existsSync(KITTY_SIDEBAR_SOCK)) {
    debug(`notify via daemon: type=${kittyType}, session=${kittySessionName}, body=${body}`)
    notifyKitty(kittySessionName, kittyType, body)
    return
  }
  debug(`notify via cmux: title=${title}, body=${body}`)

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
  debug(`init: hasDaemon=${hasDaemon}, session=${kittySessionName}, cwd=${process.cwd()}`)

  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let idleSessionID: string | null = null
  let mainSessionID: string | null = null

  function startIdleTimer(sessionID: string | undefined) {
    if (idleTimer) clearTimeout(idleTimer)
    idleSessionID = sessionID ?? null

    idleTimer = setTimeout(() => {
      idleTimer = null
      idleSessionID = null
      notify($, kittySessionName, "idle", "OpenCode", "Agent is ready for input")
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
      debug(`event: ${event.type} sessionID=${getEventSessionID(event)}`)
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
        notify($, kittySessionName, "input", "OpenCode", "Agent is asking a question", "Input Needed")
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
        "permission",
        "OpenCode",
        String(description),
        "Permission Required",
      )
    },

  }
}
