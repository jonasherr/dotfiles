import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { existsSync } from "fs"

const CMUX_SOCK = "/tmp/cmux.sock"
const IDLE_DEBOUNCE_MS = 1500
const QUESTION_TOOLS = new Set(["question", "ask_user_question", "askuserquestion"])

function isCmux(): boolean {
  return existsSync(CMUX_SOCK)
}

async function notify(
  $: PluginInput["$"],
  title: string,
  body: string,
  subtitle?: string,
): Promise<void> {
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

export const CmuxNotifyPlugin: Plugin = async ({ $ }) => {
  if (!isCmux()) return {}

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
      await notify($, "OpenCode", "Agent is ready for input")
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
        await notify($, "OpenCode", "Agent is asking a question", "Input Needed")
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
        "OpenCode",
        String(description),
        "Permission Required",
      )
    },

  }
}
