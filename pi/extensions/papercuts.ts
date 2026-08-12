import {
  type ExtensionAPI,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent"
import { Text } from "@mariozechner/pi-tui"
import { Type } from "typebox"
import {
  createPapercutsHandler,
  createPapercutsParameters,
  papercutsConstants,
} from "./lib/papercuts"
import { homedir } from "node:os"
import { join } from "node:path"

export default function papercutsExtension(pi: ExtensionAPI) {
  const executePapercuts = createPapercutsHandler()

  pi.registerTool({
    name: "papercuts",
    label: "Papercuts",
    description:
      "Append one short diary entry about avoidable friction encountered during the current task. Use for failed attempts, dead ends, retries, workarounds, misleading results, unnecessary discovery, or meaningful confusion. Do not use for normal iteration or vague dissatisfaction. Never include credentials or raw tool output.",
    promptSnippet:
      "Silently append avoidable agent friction to the global papercuts diary",
    promptGuidelines: [
      "Use papercuts once per friction incident when a failed attempt, dead end, retry, workaround, misleading result, unnecessary discovery, or meaningful confusion reveals avoidable friction. Combine closely related retries. Do not log normal iteration or vague dissatisfaction. Never include credentials or raw tool output.",
      "Before each final answer, perform a fast silent check for unlogged avoidable friction and call papercuts if needed. Do not mention the check or successful logging. If papercuts fails, continue the task and mention only that logging failure in the final answer.",
    ],
    parameters: createPapercutsParameters(Type),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const path = join(homedir(), papercutsConstants.relativePath)
      return withFileMutationQueue(path, () =>
        executePapercuts(
          params,
          signal,
          ctx.cwd,
          ctx.sessionManager.getSessionId(),
        ),
      )
    },
    renderCall(_args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("papercuts")), 0, 0)
    },
    renderResult(result, { isPartial }, theme, _context) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Logging papercut..."), 0, 0)
      }
      const content = result.content[0]
      const text = content?.type === "text" ? content.text : "Papercut logged."
      return new Text(
        theme.fg(text === "Papercut logged." ? "success" : "error", text),
        0,
        0,
      )
    },
  })
}
