import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "fs"
import { createConnection } from "net"
import { homedir } from "os"
import { basename, join } from "path"

const CMUX_SOCK = "/tmp/cmux.sock"
const KITTY_SIDEBAR_SOCK = "/tmp/kitty-sidebar.sock"
const KITTY_BIN_PATHS = ["kitty", "/Applications/kitty.app/Contents/MacOS/kitty"]
const IDLE_DEBOUNCE_MS = 1500
const QUESTION_TOOLS = new Set(["question", "ask_user_question", "askuserquestion"])

type KittyWindow = {
  is_self?: boolean
}

type KittyTab = {
  id?: number
  windows?: KittyWindow[]
}

type KittyOsWindow = {
  tabs?: KittyTab[]
}

function isCmux(): boolean {
  return existsSync(CMUX_SOCK)
}

function isKitty(): boolean {
  return existsSync(KITTY_SIDEBAR_SOCK)
}

function getKittyStdout(output: unknown): string {
  if (typeof output === "string") return output
  if (typeof output === "object" && output !== null && "stdout" in output) {
    const stdout = output.stdout
    if (typeof stdout === "string") return stdout
    if (stdout instanceof Uint8Array) return new TextDecoder().decode(stdout)
  }
  return ""
}

async function runKittyLs(
  $: PluginInput["$"],
  args: string[] = [],
): Promise<KittyOsWindow[] | undefined> {
  for (const kittyBin of KITTY_BIN_PATHS) {
    try {
      const result = await $`${kittyBin} @ ls ${args}`
      const stdout = getKittyStdout(result).trim()
      if (!stdout) continue
      const parsed = JSON.parse(stdout)
      if (Array.isArray(parsed)) {
        return parsed as KittyOsWindow[]
      }
    } catch {
      continue
    }
  }

  return undefined
}

function findSelfTabID(data: KittyOsWindow[]): number | undefined {
  for (const osWindow of data) {
    for (const tab of osWindow.tabs ?? []) {
      for (const window of tab.windows ?? []) {
        if (window.is_self && typeof tab.id === "number") {
          return tab.id
        }
      }
    }
  }

  return undefined
}

function extractTabIDs(data: KittyOsWindow[]): Set<number> {
  const tabIDs = new Set<number>()
  for (const osWindow of data) {
    for (const tab of osWindow.tabs ?? []) {
      if (typeof tab.id === "number") {
        tabIDs.add(tab.id)
      }
    }
  }
  return tabIDs
}

async function resolveKittySession($: PluginInput["$"]): Promise<string | undefined> {
  const allWindows = await runKittyLs($)
  if (!allWindows) return undefined

  const selfTabID = findSelfTabID(allWindows)
  if (typeof selfTabID !== "number") return undefined

  const sessionsDir = join(homedir(), ".config", "kitty", "sessions")
  let sessionFiles: string[] = []

  try {
    sessionFiles = readdirSync(sessionsDir)
      .filter((entry: string) => entry.endsWith(".kitty-session"))
      .map((entry: string) => basename(entry, ".kitty-session"))
  } catch {
    return undefined
  }

  for (const sessionName of sessionFiles) {
    const sessionWindows = await runKittyLs($, ["--match", `session:${sessionName}`])
    if (!sessionWindows) continue

    const tabIDs = extractTabIDs(sessionWindows)
    if (tabIDs.has(selfTabID)) {
      return sessionName
    }
  }

  return undefined
}

async function notifyKitty(
  sessionName: string | undefined,
  type: string,
  message: string,
): Promise<void> {
  try {
    const payload = JSON.stringify({
      type: "notify",
      session_name: sessionName ?? "",
      notification_type: type,
      message,
    })

    const socket = createConnection(KITTY_SIDEBAR_SOCK)
    socket.on("connect", () => {
      socket.write(`${payload}\n`)
      socket.end()
    })
    socket.on("error", () => undefined)
  } catch {
    return
  }
}

async function notify(
  $: PluginInput["$"],
  kittySessionName: Promise<string | undefined>,
  title: string,
  body: string,
  subtitle?: string,
): Promise<void> {
  if (isKitty()) {
    await notifyKitty(await kittySessionName, subtitle ?? title, body)
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

  const kittySessionName = isKitty() ? resolveKittySession($) : Promise.resolve(undefined)

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

    idleTimer = setTimeout(async () => {
      idleTimer = null
      idleSessionID = null
      await notify($, kittySessionName, "OpenCode", "Agent is ready for input")
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
        await notify($, kittySessionName, "OpenCode", "Agent is asking a question", "Input Needed")
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

      await notify(
        $,
        kittySessionName,
        "OpenCode",
        String(description),
        "Permission Required",
      )
    },

  }
}
