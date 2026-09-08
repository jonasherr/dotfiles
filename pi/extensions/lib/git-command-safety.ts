import { execFile } from "node:child_process"
import { access, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type GitCommandEffect =
  | "read-only"
  | "local-checkout-mutation"
  | "local-repository-mutation"
  | "external-or-remote-mutation"
  | "unknown"

export type GitCommandContext = {
  cwd: string
  /** The primary checkout, when a command is being evaluated for an isolated task. */
  primaryCheckout?: string
  isolatedTask?: boolean
}

export type GitCommandSafety = {
  effect: GitCommandEffect
  command?: string
  args: string[]
  targetsPrimaryCheckout: boolean
  requiresApproval: boolean
  remediation: string
}

export type GitPathspecWarning = {
  path: string
  remediation: string
  repositoryRoot: string
}

type ShellWord = { value: string; start: number }

type ShellScan = {
  substitutions: string[]
  malformed: boolean
  hasBackticks: boolean
}

type ShellSegment = {
  command: string
  precedingOperator?: string
}

type ShellSegments = {
  segments: ShellSegment[]
  complete: boolean
  unsupported: boolean
}

function commandSubstitutionEnd(command: string, start: number): number | undefined {
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = start + 2; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === "$" && command[index + 1] === "(") {
      const nestedEnd = commandSubstitutionEnd(command, index)
      if (nestedEnd === undefined) return undefined
      index = nestedEnd
      continue
    }
    if (char === ")") return index
  }

  return undefined
}

function scanShell(command: string): ShellScan {
  const substitutions: string[] = []
  let quote: "'" | '"' | undefined
  let escaped = false
  let hasBackticks = false
  let malformed = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
        continue
      }
      if (quote === '"' && char === "$" && command[index + 1] === "(") {
        const end = commandSubstitutionEnd(command, index)
        if (end === undefined) malformed = true
        else {
          substitutions.push(command.slice(index + 2, end))
          index = end
        }
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === "`") {
      hasBackticks = true
      const end = command.indexOf("`", index + 1)
      if (end < 0) malformed = true
      else index = end
      continue
    }
    if (char === "$" && command[index + 1] === "(") {
      const end = commandSubstitutionEnd(command, index)
      if (end === undefined) malformed = true
      else {
        substitutions.push(command.slice(index + 2, end))
        index = end
      }
    }
  }

  return { substitutions, malformed: malformed || Boolean(quote || escaped), hasBackticks }
}

function shellWordTokens(command: string): ShellWord[] {
  const words: ShellWord[] = []
  let value = ""
  let start = -1
  let quote: "'" | '"' | undefined
  let escaped = false

  const push = () => {
    if (start < 0) return
    words.push({ value, start })
    value = ""
    start = -1
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      if (start < 0) start = index - 1
      value += char
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      if (start < 0) start = index
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
        continue
      }
      if (quote === '"' && char === "$" && command[index + 1] === "(") {
        const end = commandSubstitutionEnd(command, index)
        if (end !== undefined) {
          if (start < 0) start = index
          value += command.slice(index, end + 1)
          index = end
          continue
        }
      }
      value += char
      continue
    }
    if (char === "'" || char === '"') {
      if (start < 0) start = index
      quote = char
      continue
    }
    if (char === "$" && command[index + 1] === "(") {
      const end = commandSubstitutionEnd(command, index)
      if (end !== undefined) {
        if (start < 0) start = index
        value += command.slice(index, end + 1)
        index = end
        continue
      }
    }
    if (/\s/.test(char)) {
      push()
      continue
    }
    if (start < 0) start = index
    value += char
  }
  if (escaped) value += "\\"
  push()
  return words
}

function shellWords(command: string): string[] {
  const scan = scanShell(command)
  // Callers pass one operator-free segment. Shell evaluation remains
  // intentionally fail-closed instead of being partially tokenized.
  if (scan.hasBackticks || scan.malformed || scan.substitutions.length > 0) return []
  return shellWordTokens(command).map(({ value }) => value)
}

function splitShellSegments(command: string): ShellSegments {
  const segments: ShellSegment[] = []
  let start = 0
  let precedingOperator: string | undefined
  let quote: "'" | '"' | undefined
  let escaped = false
  let complete = true
  let unsupported = false

  const push = (end: number) => {
    const segment = command.slice(start, end).trim()
    if (segment) segments.push({ command: segment, precedingOperator })
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === "`" || char === "(" || char === ")" || char === "{" || char === "}") {
      complete = false
      unsupported = true
      continue
    }
    if (char === "$" && command[index + 1] === "(") {
      const end = commandSubstitutionEnd(command, index)
      if (end === undefined) {
        complete = false
        break
      }
      index = end
      continue
    }
    if ([";", "|", "&", "\n", ">", "<"].includes(char)) {
      let end = index
      if ((char === ">" || char === "<") && end > start && /\d/.test(command[end - 1])) end -= 1
      push(end)

      const operatorStart = index
      while (index + 1 < command.length && [";", "|", "&", ">", "<"].includes(command[index + 1])) index += 1
      precedingOperator = char === "\n" ? "\n" : command.slice(operatorStart, index + 1)
      start = index + 1
      continue
    }
  }

  if (quote || escaped) complete = false
  push(command.length)
  return { segments, complete, unsupported }
}

function shellCommandSegments(command: string): ShellSegment[] {
  return splitShellSegments(command).segments
}

const SAFE_SUBSTITUTION_COMMANDS = new Set([
  "awk", "basename", "cat", "cut", "date", "dirname", "echo", "grep",
  "head", "printf", "realpath", "rg", "sed", "sort", "tail", "tr", "uniq", "wc",
])

const SHELL_CONTROL_WORDS = new Set([
  "case", "coproc", "do", "done", "elif", "else", "esac", "fi", "for", "function",
  "if", "in", "select", "then", "until", "while",
])

function hasUnsupportedSubstitutionSyntax(command: string): boolean {
  const scan = scanShell(command)
  const split = splitShellSegments(command)
  if (scan.hasBackticks || scan.malformed || !split.complete || split.unsupported) return true

  for (const { command: segment } of split.segments) {
    const words = shellWordTokens(segment)
    const first = words[0]?.value
    if (!first) continue
    if (first === "!" || SHELL_CONTROL_WORDS.has(first)) return true
    if (gitWordIndex(words) !== undefined) continue
    if (!SAFE_SUBSTITUTION_COMMANDS.has(first)) return true
  }
  return scan.substitutions.some((substitution) => hasUnsupportedSubstitutionSyntax(substitution))
}

function hasUnsupportedGitShell(command: string): boolean {
  const scan = scanShell(command)
  const split = splitShellSegments(command)
  if (scan.hasBackticks || scan.malformed || !split.complete || split.unsupported) return true
  return scan.substitutions.some((substitution) => hasUnsupportedSubstitutionSyntax(substitution))
}

function gitWordIndex(words: readonly ShellWord[]): number | undefined {
  let index = 0
  if (words[index]?.value === "env" || words[index]?.value.endsWith("/env")) {
    index += 1
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.value ?? "")) index += 1
  }
  return isGitExecutable(words[index]?.value) ? index : undefined
}

/** Returns true when Git occurs inside shell syntax this inspector cannot safely model. */
export function hasUninspectableGitShell(command: string): boolean {
  const hasGitWord = /(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?git(?:\s|$)/.test(command)
  if (!hasGitWord) return false
  if (hasUnsupportedGitShell(command)) return true

  return shellCommandSegments(command).some(({ command: segment, precedingOperator }) => {
    const words = shellWordTokens(segment)
    const wrappedGit = words.some(
      ({ value }, index) => isGitExecutable(value) && gitWordIndex(words) !== index,
    )
    const negatedGit = precedingOperator !== "!=" && words[0]?.value === "!" && words.some(
      ({ value }) => isGitExecutable(value),
    )
    return wrappedGit || negatedGit
  })
}

export function extractGitInvocationsFromShell(command: string): string[] {
  const direct = shellCommandSegments(command).flatMap(({ command: segment }) => {
    const words = shellWordTokens(segment)
    const index = gitWordIndex(words)
    return index === undefined ? [] : [segment.slice(words[index].start).trim()]
  })
  const nested = scanShell(command).substitutions.flatMap((substitution) =>
    extractGitInvocationsFromShell(substitution),
  )
  return [...direct, ...nested]
}

export function tokenizeGitCommand(command: string | readonly string[]): string[] {
  return typeof command === "string" ? shellWords(command) : [...command]
}

function isGitExecutable(value: string | undefined): boolean {
  return value === "git" || value?.endsWith("/git") === true
}

/** Returns the Git subcommand and its arguments after supported global options. */
export function parseGitCommand(command: string | readonly string[]): {
  command?: string
  args: string[]
} {
  const words = tokenizeGitCommand(command)
  if (!isGitExecutable(words[0])) return { args: [] }

  let index = 1
  while (index < words.length) {
    const arg = words[index]
    if (arg === "--") break
    if (!arg.startsWith("-")) break
    if (
      arg === "-C" ||
      arg === "-c" ||
      arg === "--git-dir" ||
      arg === "--work-tree" ||
      arg === "--namespace" ||
      arg === "--super-prefix"
    ) {
      index += 2
      continue
    }
    // These options carry their value in the same argument.
    if (
      arg.startsWith("-C") ||
      arg.startsWith("-c") ||
      arg.startsWith("--git-dir=") ||
      arg.startsWith("--work-tree=") ||
      arg.startsWith("--namespace=") ||
      arg.startsWith("--super-prefix=")
    ) {
      index += 1
      continue
    }
    index += 1
  }
  return { command: words[index], args: words.slice(index + 1) }
}

function hasAny(args: readonly string[], values: readonly string[]): boolean {
  return args.some((arg) => values.includes(arg))
}

function classify(command: string | undefined, args: readonly string[]): GitCommandEffect {
  if (!command) return "unknown"
  const readOnly = new Set([
    "status", "diff", "check-ignore", "log", "show", "grep", "blame", "rev-parse",
    "rev-list", "merge-base", "ls-files", "ls-tree", "show-ref", "for-each-ref", "cat-file", "version", "help",
  ])
  if (readOnly.has(command)) return "read-only"

  if (command === "branch") {
    return hasAny(args, ["-d", "-D", "-m", "-M", "--delete", "--move", "--force"])
      ? "local-repository-mutation"
      : "read-only"
  }
  if (command === "tag") {
    return hasAny(args, ["-d", "--delete", "-a", "-m", "-f", "--force"])
      ? "local-repository-mutation"
      : "read-only"
  }
  if (command === "remote") {
    return args.length === 0 || ["-v", "get-url", "show"].includes(args[0])
      ? "read-only"
      : "external-or-remote-mutation"
  }
  if (command === "worktree") {
    return args.length === 0 || args[0] === "list" ? "read-only" : "local-repository-mutation"
  }
  if (command === "config") {
    return hasAny(args, ["--get", "--get-all", "--get-regexp", "--list", "-l", "--show-origin", "--show-scope"])
      ? "read-only"
      : "external-or-remote-mutation"
  }
  if (command === "reflog") {
    const subcommand = args.find((arg) => !arg.startsWith("-"))
    return ["expire", "delete", "drop"].includes(subcommand ?? "")
      ? "local-repository-mutation"
      : "read-only"
  }
  if (["push", "pull", "fetch", "clone", "ls-remote", "submodule"].includes(command)) {
    return command === "ls-remote" ? "read-only" : "external-or-remote-mutation"
  }
  if (["add", "rm", "mv", "commit", "checkout", "switch", "restore", "merge", "rebase", "cherry-pick", "revert", "reset"].includes(command)) {
    return "local-checkout-mutation"
  }
  if (["stash", "update-ref", "replace", "notes", "gc", "prune", "pack-refs", "filter-branch"].includes(command)) {
    return "local-repository-mutation"
  }
  return "unknown"
}

function commandDirectory(words: readonly string[], cwd: string): string {
  let directory = resolve(cwd)
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === "-C" && words[index + 1]) {
      directory = resolve(directory, words[index + 1])
      index += 1
      continue
    }
    if (words[index].startsWith("-C") && words[index].length > 2) {
      directory = resolve(directory, words[index].slice(2))
      continue
    }
    if (words[index] === "--work-tree" && words[index + 1]) {
      return resolve(directory, words[index + 1])
    }
    if (words[index].startsWith("--work-tree=")) {
      return resolve(directory, words[index].slice("--work-tree=".length))
    }
  }
  return directory
}

/** Classifies direct Git invocations. Shell scripts and aliases intentionally fail closed as unknown. */
export function classifyGitCommand(
  command: string | readonly string[],
  context: GitCommandContext,
): GitCommandSafety {
  const words = tokenizeGitCommand(command)
  const parsed = parseGitCommand(words)
  const effect = classify(parsed.command, parsed.args)
  const actualCwd = commandDirectory(words, context.cwd)
  const targetsPrimaryCheckout = Boolean(
    context.primaryCheckout && resolve(context.primaryCheckout) === actualCwd,
  )
  const requiresApproval = effect !== "read-only"
  const remediation = effect === "read-only"
    ? "Git inspection is read-only."
    : effect === "unknown"
      ? "Use a known read-only Git command or request approval before running this command."
      : context.isolatedTask && targetsPrimaryCheckout
        ? "Run this mutation in the isolated worktree, not the primary checkout."
        : "Review the Git mutation and request approval before running it."
  return { effect, command: parsed.command, args: parsed.args, targetsPrimaryCheckout, requiresApproval, remediation }
}

async function gitRoot(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { shell: false })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

function isDescendant(root: string, path: string): boolean {
  const value = relative(root, path)
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)
}

/** Detects a root-relative path copied into a Git command run from a nested directory. */
export async function detectGitPathspecCwdMistake(
  command: string | readonly string[],
  context: Pick<GitCommandContext, "cwd">,
): Promise<GitPathspecWarning | undefined> {
  const words = tokenizeGitCommand(command)
  const parsed = parseGitCommand(words)
  if (!parsed.command || !["diff", "status", "add", "restore", "checkout", "rm", "grep", "ls-files"].includes(parsed.command)) return undefined
  const candidates = parsed.args.includes("--")
    ? parsed.args.slice(parsed.args.indexOf("--") + 1)
    : parsed.args.filter((arg) => !arg.startsWith("-"))
  if (candidates.length === 0) return undefined

  let cwd: string
  try {
    cwd = await realpath(commandDirectory(words, context.cwd))
  } catch {
    return undefined
  }
  const root = await gitRoot(cwd)
  if (!root || !isDescendant(root, cwd)) return undefined
  for (const path of candidates) {
    if (!path || path.startsWith("-") || path.startsWith(":(top)") || isAbsolute(path) || /^[A-Za-z0-9]+\.\.[A-Za-z0-9]+$/.test(path)) continue
    try {
      await access(resolve(cwd, path))
      continue
    } catch { /* check root below */ }
    try {
      await access(resolve(root, path))
      const corrected = relative(cwd, resolve(root, path)) || "."
      return { path, repositoryRoot: root, remediation: `Use ${corrected} relative to the current directory, or run the command from ${root}.` }
    } catch { /* not a root-relative path */ }
  }
  return undefined
}
