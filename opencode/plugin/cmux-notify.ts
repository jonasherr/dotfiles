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
  const args = ["cmux", "notify", "--title", title, "--body", body]
  if (subtitle) args.push("--subtitle", subtitle)
  try {
    await $`${args}`
  } catch {
    // cmux not available or command failed — silent
  }
}

export const CmuxNotifyPlugin: Plugin = async ({ $ }) => {
  if (!isCmux()) return {}

  // Debounce idle notifications — mirrors oh-my-opencode's idle confirmation delay.
  // Without this, CMUX notification would fire on every transient idle event.
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        if (idleTimer) clearTimeout(idleTimer)

        idleTimer = setTimeout(async () => {
          idleTimer = null
          await notify($, "OpenCode", "Agent is ready for input")
        }, IDLE_DEBOUNCE_MS)
        return
      }

      if (
        event.type === "message.updated" ||
        event.type === "session.created"
      ) {
        if (idleTimer) {
          clearTimeout(idleTimer)
          idleTimer = null
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

      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }

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
