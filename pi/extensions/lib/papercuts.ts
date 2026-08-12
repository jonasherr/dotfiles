import { appendFile, mkdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const PAPERCUTS_RELATIVE_PATH = join(
  ".local",
  "share",
  "papercuts",
  "papercuts.md",
)

type Schema = Record<string, unknown>

export type PapercutsSchemaBuilder = {
  String(options?: Record<string, unknown>): Schema
  Object(
    properties: Record<string, Schema>,
    options?: Record<string, unknown>,
  ): Schema
}

export type PapercutsDependencies = {
  homedir: () => string
  now: () => Date
  mkdir: typeof mkdir
  appendFile: typeof appendFile
  fileSize: (path: string) => Promise<number>
}

const defaultDependencies: PapercutsDependencies = {
  homedir,
  now: () => new Date(),
  mkdir,
  appendFile,
  fileSize: async (path) => {
    try {
      return (await stat(path)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0
      throw error
    }
  },
}

export function createPapercutsParameters(
  Type: PapercutsSchemaBuilder,
): Schema {
  return Type.Object(
    {
      description: Type.String({
        minLength: 1,
        description:
          "A short, self-contained description of the avoidable friction. Never include credentials or raw tool output.",
      }),
    },
    { additionalProperties: false },
  )
}

export function redactCredentials(description: string): string {
  return description
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(authorization\s*:\s*)(?:bearer|basic)\s+[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(password|passwd|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,})\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED TOKEN]",
    )
}

function markdownInline(value: string): string {
  return value.replace(/[`\r\n]/g, (character) =>
    character === "`" ? "\\`" : " ",
  )
}

export function formatPapercutEntry(input: {
  timestamp: Date
  cwd: string
  sessionId?: string
  description: string
}): string {
  const session = input.sessionId
    ? `  \n**Session:** \`${markdownInline(input.sessionId)}\`\n`
    : "\n"

  return [
    `## ${input.timestamp.toISOString()}`,
    "",
    `**Path:** \`${markdownInline(input.cwd)}\`${session}`,
    redactCredentials(input.description).trim().replace(/^(\s*)#/gm, "$1\\#"),
    "",
  ].join("\n")
}

export function createPapercutsHandler(
  dependencies: Partial<PapercutsDependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies }

  return async function executePapercuts(
    params: { description: string },
    signal: AbortSignal,
    cwd: string,
    sessionId?: string,
  ) {
    try {
      if (signal.aborted) throw new Error("operation cancelled")
      if (!params.description?.trim()) {
        throw new Error("description must not be empty")
      }

      const path = join(deps.homedir(), PAPERCUTS_RELATIVE_PATH)
      await deps.mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const prefix = (await deps.fileSize(path)) > 0 ? "\n" : ""
      const entry = formatPapercutEntry({
        timestamp: deps.now(),
        cwd,
        sessionId,
        description: params.description,
      })
      await deps.appendFile(path, `${prefix}${entry}`, {
        encoding: "utf8",
        mode: 0o600,
      })

      return {
        content: [{ type: "text" as const, text: "Papercut logged." }],
        details: { path },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`papercuts failed: ${message}`, { cause: error })
    }
  }
}

export const papercutsConstants = {
  relativePath: PAPERCUTS_RELATIVE_PATH,
}
