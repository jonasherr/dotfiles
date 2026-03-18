import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "fs"
import { createConnection } from "net"
import { homedir } from "os"
import { basename, join } from "path"

const CMUX_SOCK = "/tmp/cmux.sock"
const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock"
const KITTY_BIN_PATHS = ["kitty", "/Applications/kitty.app/Contents/MacOS/kitty"]
const IDLE_DEBOUNCE_MS = 1500
const RESOLVE_TIMEOUT_MS = 5000
const QUESTION_TOOLS = new Set(["question", "ask_user_question", "askuserquestion"])

function isCmux(): boolean {
  return existsSync(CMUX_SOCK)
}

function isKitty(): boolean {
  // Must be running inside Kitty AND have the sidebar daemon socket available
  return !!process.env.KITTY_WINDOW_ID && existsSync(KITTY_SIDEBAR_SOCK)
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

async function resolveKittySession($: PluginInput["$"]): Promise<string | undefined> {
  try {
    // Run kitty @ ls to find which session this window belongs to
    let allWindows: Array<{ tabs?: Array<{ id?: number; windows?: Array<{ is_self?: boolean }> }> }> | undefined

    for (const kittyBin of KITTY_BIN_PATHS) {
      try {
        const result = await withTimeout($`${kittyBin} @ ls`, 3000, undefined)
        if (!result) continue
        const stdout = typeof result === "string" ? result
          : typeof result === "object" && result !== null && "stdout" in result
            ? String(result.stdout)
            : ""
        if (!stdout.trim()) continue
        const parsed = JSON.parse(stdout.trim())
        if (Array.isArray(parsed)) { allWindows = parsed; break }
      } catch { continue }
    }
    if (!allWindows) return undefined

    // Find our tab ID
    let selfTabID: number | undefined
    for (const osWindow of allWindows) {
      for (const tab of osWindow.tabs ?? []) {
        for (const window of tab.windows ?? []) {
          if (window.is_self && typeof tab.id === "number") {
            selfTabID = tab.id
          }
        }
      }
    }
    if (typeof selfTabID !== "number") return undefined

    // Match to session
    const sessionsDir = join(homedir(), ".config", "kitty", "sessions")
    let sessionFiles: string[] = []
    try {
      sessionFiles = readdirSync(sessionsDir)
        .filter((entry: string) => entry.endsWith(".kitty-session"))
        .map((entry: string) => basename(entry, ".kitty-session"))
    } catch { return undefined }

    for (const sessionName of sessionFiles) {
      for (const kittyBin of KITTY_BIN_PATHS) {
        try {
          const result = await withTimeout(
            $`${kittyBin} @ ls --match ${`session:${sessionName}`}`,
            2000,
            undefined,
          )
          if (!result) continue
          const stdout = typeof result === "string" ? result
            : typeof result === "object" && result !== null && "stdout" in result
              ? String(result.stdout)
              : ""
          if (!stdout.trim()) continue
          const parsed = JSON.parse(stdout.trim())
          if (!Array.isArray(parsed)) continue
          for (const osWindow of parsed) {
            for (const tab of (osWindow as { tabs?: Array<{ id?: number }> }).tabs ?? []) {
              if (tab.id === selfTabID) return sessionName
            }
          }
          break // parsed successfully from this binary, no need to try next
        } catch { continue }
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

async function resolveKittyWindowId($: PluginInput["$"]): Promise<number | undefined> {
  // Fast path: env var
  const envVal = process.env.KITTY_WINDOW_ID
  if (envVal) {
    const parsed = parseInt(envVal, 10)
    if (!Number.isNaN(parsed)) return parsed
  }

  // Fallback: kitten @ ls to find is_self window
  try {
    for (const kittyBin of KITTY_BIN_PATHS) {
      try {
        const result = await withTimeout($`${kittyBin} @ ls`, 3000, undefined)
        if (!result) continue
        const stdout = typeof result === "string" ? result
          : typeof result === "object" && result !== null && "stdout" in result
            ? String(result.stdout)
            : ""
        if (!stdout.trim()) continue
        const parsed = JSON.parse(stdout.trim())
        if (!Array.isArray(parsed)) continue
        for (const osWindow of parsed) {
          for (const tab of (osWindow as any).tabs ?? []) {
            for (const window of tab.windows ?? []) {
              if (window.is_self && typeof window.id === "number") return window.id
            }
          }
        }
        break
      } catch { continue }
    }
  } catch { /* silent */ }
  return undefined
}

function notifyKitty(
  sessionName: string | undefined,
  type: string,
  message: string,
  windowId?: number,
): void {
  // Fire-and-forget — never await, never block
  try {
    const payload = JSON.stringify({
      type: "notify",
      session_name: sessionName ?? "",
      notification_type: type,
      message,
      ...(windowId !== undefined ? { window_id: windowId } : {}),
    })

    const socket = createConnection(KITTY_SIDEBAR_SOCK)
    socket.setTimeout(2000)
    socket.on("connect", () => {
      socket.write(`${payload}\n`)
      socket.end()
    })
    socket.on("error", () => { try { socket.destroy() } catch {} })
    socket.on("timeout", () => { try { socket.destroy() } catch {} })
  } catch {
    // Silent — notification is best-effort
  }
}

async function notify(
  $: PluginInput["$"],
  kittySessionName: string | undefined,
  kittyWindowId: number | undefined,
  title: string,
  body: string,
  subtitle?: string,
): Promise<void> {
  if (isKitty()) {
    notifyKitty(kittySessionName, subtitle ?? title, body, kittyWindowId)
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
  if (!isCmux() && !isKitty()) return {}

  // Resolve Kitty session name eagerly but with a hard timeout.
  // If resolution hangs or fails, we still send notifications with empty session name.
  let kittySessionName: string | undefined
  if (isKitty()) {
    kittySessionName = await withTimeout(resolveKittySession($), RESOLVE_TIMEOUT_MS, undefined)
  }

  // Resolve Kitty window ID: try env var first, then fallback to kitten @ ls
  let kittyWindowId: number | undefined
  if (isKitty()) {
    kittyWindowId = await withTimeout(resolveKittyWindowId($), RESOLVE_TIMEOUT_MS, undefined)
  }

  // Debounce idle notifications — mirrors oh-my-opencode's idle confirmation delay.
  // Without this, CMUX notification would fire on every transient idle event.
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  // Track which session triggered the pending idle notification.
  // Only cancel the timer when the SAME session produces a non-idle event.
  // Without this, background agent message.updated events cancel the main session's idle.
  let idleSessionID: string | null = null

  function startIdleTimer(sessionID: string | undefined) {
    if (idleTimer) clearTimeout(idleTimer)
    idleSessionID = sessionID ?? null

    idleTimer = setTimeout(() => {
      idleTimer = null
      idleSessionID = null
      notify($, kittySessionName, kittyWindowId, "OpenCode", "Agent is ready for input")
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
      // Handle both native session.idle and session.status(idle) events.
      // OpenCode may emit either or both for the same idle transition.
      if (event.type === "session.idle" || isIdleStatusEvent(event)) {
        startIdleTimer(getEventSessionID(event))
        return
      }

      // Only cancel the debounce for activity in the SAME session.
      // Background agent events (different sessionID) must not cancel the
      // main session's idle notification.
      if (event.type === "message.updated" || event.type === "session.created") {
        if (idleTimer && idleSessionID) {
          const eventSessionID = getEventSessionID(event)
          if (eventSessionID === idleSessionID) {
            cancelIdleTimer()
          }
        }
      }
    },

    "tool.execute.before": async (input) => {
      const toolName = input.tool?.toLowerCase()
      if (toolName && QUESTION_TOOLS.has(toolName)) {
        notify($, kittySessionName, kittyWindowId, "OpenCode", "Agent is asking a question", "Input Needed")
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
        "OpenCode",
        String(description),
        "Permission Required",
      )
    },

  }
}
