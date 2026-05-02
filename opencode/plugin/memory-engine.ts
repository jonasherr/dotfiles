import type { Plugin } from "@opencode-ai/plugin"
import { stat, mkdir } from "node:fs/promises"

// ─── Constants ───────────────────────────────────────────────────────────────

const VAULT_PATH =
  process.env.NOTES ??
  `${process.env.HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes`
const DAILY_LOG_DIR = VAULT_PATH + "/areas/agent-learnings/daily"
const MAX_DAILY_LOG_CHARS = 6_000
const MAX_PROJECT_MEMORY_CHARS = 2_000
const AUTO_LOG_TOOLS = ["write", "edit"]

let mainSessionId: string | undefined

const REMEMBER_TRIGGERS = [
  "remember this",
  "remember that",
  "save this to memory",
  "note this down",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

/**
 * Truncate content keeping the tail (most recent entries are more valuable).
 * Iterates lines bottom-up until the char budget is reached.
 */
function truncateKeepTail(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const lines = content.split("\n")
  const kept: string[] = []
  let charCount = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (charCount + line.length + 1 > maxChars) break
    kept.unshift(line)
    charCount += line.length + 1
  }
  return kept.join("\n")
}

/**
 * Read a file safely, returning empty string on any error.
 */
async function safeReadFile(path: string): Promise<string> {
  try {
    return await Bun.file(path).text()
  } catch {
    return ""
  }
}

/**
 * Ensure .sisyphus/memory.md exists if .sisyphus/ directory is present.
 * Returns the path if created/exists, null otherwise.
 */
async function ensureMemoryFile(worktree: string): Promise<string | null> {
  const sisyphusDir = worktree + "/.sisyphus"
  const memoryPath = sisyphusDir + "/memory.md"

  try {
    const dirStat = await stat(sisyphusDir)
    if (!dirStat.isDirectory()) return null
  } catch {
    // .sisyphus/ doesn't exist — don't create it
    return null
  }

  try {
    await stat(memoryPath)
  } catch {
    // File doesn't exist — create it
    try {
      await Bun.write(memoryPath, "# Project Memory\n\n")
    } catch (writeErr) {
      console.error("[memory-engine] failed to create memory file:", writeErr)
      return null
    }
  }

  return memoryPath
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export const MemoryEnginePlugin: Plugin = async ({ worktree }) => {
  return {
    // ── Hook 1: Bootstrap Loading ──────────────────────────────────────────
    "experimental.chat.system.transform": async (input, output) => {
      try {
        if (mainSessionId && input.sessionID !== mainSessionId) return

        const today = new Date()
        const yesterday = new Date(today.getTime() - 86_400_000)

        const todayLog = await safeReadFile(
          `${DAILY_LOG_DIR}/${formatDate(today)}.md`,
        )
        const yesterdayLog = await safeReadFile(
          `${DAILY_LOG_DIR}/${formatDate(yesterday)}.md`,
        )

        const projectMemoryPath = `${worktree}/.sisyphus/memory.md`
        const projectMemory = await safeReadFile(projectMemoryPath)

        const parts: string[] = []

        const dailyContent = [
          yesterdayLog ? `### Yesterday (${formatDate(yesterday)})\n${yesterdayLog}` : "",
          todayLog ? `### Today (${formatDate(today)})\n${todayLog}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")

        if (dailyContent) {
          const truncatedDaily = truncateKeepTail(dailyContent, MAX_DAILY_LOG_CHARS)
          parts.push(`## Daily Activity Logs\n\n${truncatedDaily}`)
        }

        if (projectMemory.trim()) {
          const truncatedMemory = truncateKeepTail(
            projectMemory,
            MAX_PROJECT_MEMORY_CHARS,
          )
          parts.push(`## Project Memory\n\n${truncatedMemory}`)
        }

        if (parts.length === 0) return

        const block = `## Agent Memory\n\n${parts.join("\n\n---\n\n")}`

        const existingIdx = output.system.findIndex((s: string) =>
          s.startsWith("## Agent Memory"),
        )
        if (existingIdx !== -1) {
          output.system[existingIdx] = block
        } else {
          output.system.push(block)
        }
      } catch (err) {
        console.error("[memory-engine] experimental.chat.system.transform error:", err)
      }
    },

    // ── Hook 2: Compaction Context ─────────────────────────────────────────
    "experimental.session.compacting": async (input, output) => {
      try {
        output.context.push(
          `When summarizing this session, preserve the following information:\n` +
            `- Key decisions made and their rationale\n` +
            `- File paths that were modified and why\n` +
            `- Current task state and progress\n` +
            `- Any debugging findings or insights\n` +
            `- Error patterns encountered and how they were resolved`,
        )

        const today = formatDate(new Date())
        const dailyLogPath = `${DAILY_LOG_DIR}/${today}.md`

        try {
          const dailyLogContent = await Bun.file(dailyLogPath).text()
          if (dailyLogContent.length > 0) {
            const truncated = dailyLogContent.slice(0, 1_000)
            output.context.push(
              `The following activity has already been logged for today. Reference it for continuity:\n` +
                truncated,
            )
          }
        } catch (fileErr) {
          if (
            fileErr instanceof Error &&
            "code" in fileErr &&
            (fileErr as NodeJS.ErrnoException).code !== "ENOENT"
          ) {
            console.error("[memory-engine] failed to read daily log:", fileErr)
          }
        }
      } catch (err) {
        console.error("[memory-engine] experimental.session.compacting error:", err)
      }
    },

    // ── Hook 3: "Remember This" Detection ──────────────────────────────────
    "chat.message": async (input, output) => {
      try {
        if (!mainSessionId) mainSessionId = input.sessionID
        if (input.sessionID !== mainSessionId) return

        const userText = output.parts
          .filter((p) => p.type === "text")
          .map((p) => ("text" in p ? p.text : ""))
          .join("\n")

        if (!userText) return

        const lowerText = userText.toLowerCase()
        const triggered = REMEMBER_TRIGGERS.some((t) => lowerText.includes(t))

        if (triggered) {
          const today = formatDate(new Date())
          const dailyLogPath = `${DAILY_LOG_DIR}/${today}.md`

          try {
            await stat(DAILY_LOG_DIR)
          } catch {
            await mkdir(DAILY_LOG_DIR, { recursive: true })
          }

          let existingContent = ""
          try {
            existingContent = await Bun.file(dailyLogPath).text()
          } catch {
            // ENOENT expected for new daily log
          }

          const timestamp = new Date()
            .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

          let contentToRemember = userText
          for (const trigger of REMEMBER_TRIGGERS) {
            const idx = lowerText.indexOf(trigger)
            if (idx !== -1) {
              const afterTrigger = userText.slice(idx + trigger.length).trim()
              if (afterTrigger.length > 10) {
                contentToRemember = afterTrigger
              }
              break
            }
          }

          if (!existingContent) {
            existingContent = `# ${today}\n\n## Activity\n\n## Decisions\n\n## Key Context\n`
          }

          const entry = `- ${timestamp} — [remembered]: ${contentToRemember}\n`

          if (existingContent.includes("## Key Context")) {
            existingContent = existingContent.replace(
              "## Key Context\n",
              `## Key Context\n${entry}`,
            )
          } else {
            existingContent += `\n## Key Context\n${entry}`
          }

          await Bun.write(dailyLogPath, existingContent)
          console.error(`[memory-engine] remembered: ${contentToRemember.slice(0, 80)}...`)
        }
      } catch (err) {
        console.error("[memory-engine] chat.message error:", err)
      }
    },

    // ── Hook 4: Auto-Log Tool Operations ───────────────────────────────────
    "tool.execute.after": async (input, output) => {
      try {
        if (mainSessionId && input.sessionID !== mainSessionId) return

        const toolName = input.tool?.toLowerCase()
        if (!toolName || !AUTO_LOG_TOOLS.includes(toolName)) return

        const memoryPath = await ensureMemoryFile(worktree)
        if (!memoryPath) return

        const timestamp = new Date()
          .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

        const filePath = output.metadata?.filePath || output.metadata?.path || input.args?.filePath || "unknown"
        const entry = `- ${timestamp} — [${toolName}]: ${filePath}\n`

        try {
          const existing = await Bun.file(memoryPath).text()
          const truncated = truncateKeepTail(existing, MAX_PROJECT_MEMORY_CHARS)
          await Bun.write(memoryPath, truncated + entry)
        } catch (writeErr) {
          console.error("[memory-engine] failed to append to memory:", writeErr)
        }

        try {
          const gitignorePath = worktree + "/.gitignore"
          const gitignoreEntry = ".sisyphus/memory.md"
          let gitignoreContent = ""

          try {
            gitignoreContent = await Bun.file(gitignorePath).text()
          } catch {
            // ENOENT — no .gitignore yet
          }

          if (!gitignoreContent.includes(gitignoreEntry)) {
            gitignoreContent =
              gitignoreContent.trimEnd() +
              "\n# Agent memory\n" +
              gitignoreEntry +
              "\n"
            await Bun.write(gitignorePath, gitignoreContent)
          }
        } catch (gitignoreErr) {
          console.error("[memory-engine] failed to update .gitignore:", gitignoreErr)
        }
      } catch (err) {
        console.error("[memory-engine] tool.execute.after error:", err)
      }
    },
  }
}
