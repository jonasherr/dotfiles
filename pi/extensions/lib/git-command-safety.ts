import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
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
  // Keep substitutions opaque; classification separately checks substituted arguments.
  if (scan.malformed) return []
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
  // Subshell and brace-group delimiters only count as separators when they
  // stand alone, so `${HOME}`, `{}` placeholders, and arrays stay inside words.
  const standalone = (index: number) =>
    (index === 0 || /\s/.test(command[index - 1])) &&
    (index + 1 === command.length || /\s/.test(command[index + 1]))

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
    if (char === "`") {
      unsupported = true
      const end = command.indexOf("`", index + 1)
      if (end < 0) complete = false
      else index = end
      continue
    }
    if ((char === "<" || char === ">") && command[index + 1] === "(") {
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
    const opensSubshell = char === "(" && (index === 0 || /\s/.test(command[index - 1]))
    if (opensSubshell || ((char === ")" || char === "{" || char === "}") && standalone(index))) {
      push(index)
      precedingOperator = char
      start = index + 1
      continue
    }
    if ([";", "|", "&", "\n", ">", "<"].includes(char)) {
      let end = index
      if ((char === ">" || char === "<") && end > start && /\d/.test(command[end - 1])) end -= 1
      push(end)
      const operatorStart = index
      while (index + 1 < command.length && [";", "|", "&", ">", "<"].includes(command[index + 1])) index += 1
      precedingOperator = command.slice(operatorStart, index + 1)
      start = index + 1
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
    if (SHELL_CONTROL_WORDS.has(first)) return true
    if (gitWordIndex(words) !== undefined) continue
    if (!SAFE_SUBSTITUTION_COMMANDS.has(first)) return true
  }
  return scan.substitutions.some((substitution) => hasUnsupportedSubstitutionSyntax(substitution))
}

const DATA_COMMANDS = new Set([
  "[", "[[", "ack", "ag", "awk", "basename", "brew", "cat", "cd", "code", "command", "dirname",
  "du", "echo", "egrep", "fd", "fgrep", "file", "find", "grep", "head", "info", "jq", "less",
  "ln", "ls", "man", "mkdir", "more", "nvim", "open", "printf", "readlink", "realpath", "rg",
  "sed", "stat", "tail", "test", "tldr", "touch", "tree", "type", "vim", "wc", "whereis", "which",
])
const SHELL_INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh"])
const CONTROL_PREFIXES = new Set(["!", "if", "then", "do", "else", "elif", "while", "until"])
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const GIT_WORD = /(?:^|[\s;&|()'"])(?:[^\s;&|()'"]*\/)?git(?:\s|$)/

function executableName(value: string | undefined): string | undefined {
  return value?.split("/").pop()
}

/** Skips assignments, control keywords, and wrappers that run the next word unchanged. */
function commandWordIndex(words: readonly ShellWord[]): number {
  let index = 0
  while (index < words.length) {
    const value = words[index].value
    if (ASSIGNMENT.test(value) || CONTROL_PREFIXES.has(value) || value === "nohup") {
      index += 1
      continue
    }
    if (value === "env" || value.endsWith("/env")) {
      index += 1
      if (words[index]?.value === "-i") index += 1
      while (ASSIGNMENT.test(words[index]?.value ?? "")) index += 1
      continue
    }
    if (value === "time") {
      index += words[index + 1]?.value === "-p" ? 2 : 1
      continue
    }
    if (value === "nice") {
      index += words[index + 1]?.value === "-n" ? 3 : 1
      continue
    }
    if (value === "timeout") {
      index += 1
      while (words[index]?.value.startsWith("-") && words[index]?.value !== "--") index += 1
      if (words[index]?.value === "--") index += 1
      index += 1
      continue
    }
    break
  }
  return index
}

function isCommandLookup(words: readonly ShellWord[], commandIndex: number): boolean {
  return ["-v", "-V"].includes(words[commandIndex + 1]?.value ?? "")
}

function gitWordIndex(words: readonly ShellWord[]): number | undefined {
  let index = commandWordIndex(words)
  if (words[index]?.value === "command") {
    if (isCommandLookup(words, index)) return undefined
    index += 1
  }
  return isGitExecutable(words[index]?.value) ? index : undefined
}

/** A git word passed as data to a known non-executing command is not a Git invocation. */
function allowedNonCommandGit(words: readonly ShellWord[], gitIndex: number): boolean {
  const commandIndex = commandWordIndex(words)
  const command = executableName(words[commandIndex]?.value)
  if (!command || !DATA_COMMANDS.has(command) || gitIndex <= commandIndex) return false
  if (command === "command") return isCommandLookup(words, commandIndex)
  if (command === "find") {
    return !words.some(({ value }) => ["-exec", "-execdir", "-ok", "-okdir"].includes(value))
  }
  return true
}

/** Returns the script argument of `sh -c SCRIPT`-style invocations and `eval`. */
function shellScriptArgument(words: readonly ShellWord[], commandIndex: number): string | undefined {
  const executable = executableName(words[commandIndex]?.value)
  if (executable === "eval") {
    return words.slice(commandIndex + 1).map(({ value }) => value).join(" ")
  }
  if (!executable || !SHELL_INTERPRETERS.has(executable)) return undefined
  const flagIndex = words.findIndex(
    ({ value }, position) => position > commandIndex && /^-[A-Za-z]*c[A-Za-z]*$/.test(value),
  )
  return flagIndex >= 0 ? words[flagIndex + 1]?.value : undefined
}

function hasUnsupportedGitShell(command: string): boolean {
  const scan = scanShell(command)
  const split = splitShellSegments(command)
  if (scan.hasBackticks || scan.malformed || !split.complete || split.unsupported) return true

  for (const { command: segment, precedingOperator } of split.segments) {
    const words = shellWordTokens(segment)
    const commandIndex = commandWordIndex(words)
    const executable = executableName(words[commandIndex]?.value)
    const gitIndex = words.findIndex(({ value }) => isGitExecutable(value))

    if (gitIndex >= 0 && gitWordIndex(words) !== gitIndex && !allowedNonCommandGit(words, gitIndex)) {
      return true
    }
    // Bare negation stays fail-closed; `if ! git ...` is handled as a control prefix.
    if (words[0]?.value === "!" && gitIndex >= 0) return true
    if (executable === "command" && !isCommandLookup(words, commandIndex)) return true

    const script = shellScriptArgument(words, commandIndex)
    if (script !== undefined && GIT_WORD.test(script) && hasUnsupportedGitShell(script)) return true

    // Text piped into a shell is executed, so Git words upstream are not plain data.
    const pipedIntoShell = Boolean(precedingOperator?.startsWith("|")) && precedingOperator !== "||"
    if (pipedIntoShell && executable && SHELL_INTERPRETERS.has(executable) && script === undefined) {
      return true
    }
  }
  return scan.substitutions.some((substitution) => hasUnsupportedSubstitutionSyntax(substitution))
}

/** Returns true when Git occurs inside shell syntax this inspector cannot safely model. */
export function hasUninspectableGitShell(command: string): boolean {
  return GIT_WORD.test(command) && hasUnsupportedGitShell(command)
}

export function extractGitInvocationsFromShell(command: string): string[] {
  const direct = shellCommandSegments(command).flatMap(({ command: segment }) => {
    const words = shellWordTokens(segment)
    const index = gitWordIndex(words)
    if (index !== undefined) return [segment.slice(words[index].start).trim()]
    const script = shellScriptArgument(words, commandWordIndex(words))
    return script === undefined ? [] : extractGitInvocationsFromShell(script)
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

  // `git --version` and friends print information instead of running a subcommand.
  if (words[1]?.startsWith("-") && INFO_COMMANDS.has(words[1])) {
    return { command: words[1], args: words.slice(2) }
  }

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

const READ_ONLY_COMMANDS = new Set([
  "annotate", "blame", "cat-file", "check-attr", "check-ignore", "check-mailmap", "check-ref-format",
  "cherry", "count-objects", "describe", "diff", "diff-files", "diff-index", "diff-tree",
  "for-each-ref", "fsck", "get-tar-commit-id", "grep", "log", "ls-files", "ls-tree", "merge-base",
  "name-rev", "patch-id", "range-diff", "rev-list", "rev-parse", "shortlog", "show", "show-branch",
  "show-ref", "status", "var", "verify-commit", "verify-tag", "whatchanged",
])
const INFO_COMMANDS = new Set([
  "--exec-path", "--help", "--html-path", "--info-path", "--man-path", "--version", "-h", "help", "version",
])
const CONFIG_READ_FLAGS = [
  "--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool", "--list", "-l",
]
const CONFIG_WRITE_FLAGS = [
  "--unset", "--unset-all", "--add", "--replace-all", "--rename-section", "--remove-section", "-e", "--edit",
]
const CONFIG_WRITE_SUBCOMMANDS = ["set", "unset", "rename-section", "remove-section", "edit"]

function firstPositional(args: readonly string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("-"))
}

function hasOutputOption(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--output" || arg.startsWith("--output=") || arg === "-o")
}

function classifyConfig(args: readonly string[]): GitCommandEffect {
  if (hasAny(args, CONFIG_WRITE_FLAGS) || CONFIG_WRITE_SUBCOMMANDS.includes(args[0] ?? "")) {
    return "external-or-remote-mutation"
  }
  if (["get", "list"].includes(args[0] ?? "") || hasAny(args, CONFIG_READ_FLAGS)) return "read-only"
  const positional = args.filter((arg) => !arg.startsWith("-"))
  if (positional.length === 1) return "read-only"
  // Config writes can plant code execution (core.pager, core.fsmonitor, aliases).
  return positional.length >= 2 ? "external-or-remote-mutation" : "unknown"
}

function classify(command: string | undefined, args: readonly string[]): GitCommandEffect {
  if (!command) return "unknown"
  if (INFO_COMMANDS.has(command)) return "read-only"
  if (READ_ONLY_COMMANDS.has(command)) {
    const writesFile = ["diff", "log", "show"].includes(command) &&
      args.some((arg) => arg === "--output" || arg.startsWith("--output="))
    return writesFile ? "local-checkout-mutation" : "read-only"
  }

  switch (command) {
    case "config":
      return classifyConfig(args)
    case "symbolic-ref":
      return hasAny(args, ["-d", "--delete"]) || args.filter((arg) => !arg.startsWith("-")).length !== 1
        ? "local-repository-mutation"
        : "read-only"
    case "apply": {
      const inspectsOnly = hasAny(args, ["--check", "--stat", "--numstat", "--summary"]) &&
        !hasAny(args, ["--index", "--cached", "--apply"])
      return inspectsOnly ? "read-only" : "local-checkout-mutation"
    }
    case "format-patch":
      return args.includes("--stdout") ? "read-only" : "local-checkout-mutation"
    case "archive":
      return hasOutputOption(args) ? "local-checkout-mutation" : "read-only"
    case "remote":
      return args.length === 0 || ["-v", "--verbose", "show", "get-url"].includes(args[0])
        ? "read-only"
        : "local-repository-mutation"
    case "worktree":
      return args.length === 0 || args[0] === "list" ? "read-only" : "local-repository-mutation"
    case "branch":
      return hasAny(args, ["-d", "-D", "-m", "-M", "--delete", "--move", "--force"])
        ? "local-repository-mutation"
        : "read-only"
    case "tag":
      return hasAny(args, ["-d", "--delete", "-a", "-m", "-f", "--force"])
        ? "local-repository-mutation"
        : "read-only"
    case "reflog":
      return ["expire", "delete", "drop"].includes(firstPositional(args) ?? "")
        ? "local-repository-mutation"
        : "read-only"
    case "stash":
      return ["list", "show"].includes(firstPositional(args) ?? "") ? "read-only" : "local-repository-mutation"
    case "notes":
      return ["list", "show"].includes(args[0] ?? "") ? "read-only" : "local-repository-mutation"
    case "bisect":
      return ["log", "view", "visualize"].includes(args[0] ?? "") ? "read-only" : "local-checkout-mutation"
    case "submodule": {
      const subcommand = firstPositional(args)
      if (subcommand === undefined || subcommand === "status" || subcommand === "summary") return "read-only"
      // foreach runs arbitrary shell commands in every submodule.
      return subcommand === "foreach" ? "unknown" : "local-checkout-mutation"
    }
    case "clean":
      // Deletion itself (-f) is reported by detectDestructiveGitOperation.
      return hasFlag(args, "n", "--dry-run") ? "read-only" : "local-checkout-mutation"
    case "push":
      return "external-or-remote-mutation"
    case "init":
    case "fetch":
      return "local-repository-mutation"
    case "ls-remote":
      return "read-only"
    case "pull":
    case "clone":
      return "local-checkout-mutation"
  }
  if (["add", "rm", "mv", "commit", "checkout", "switch", "restore", "merge", "rebase", "cherry-pick", "revert", "reset"].includes(command)) {
    return "local-checkout-mutation"
  }
  if (["update-ref", "replace", "gc", "prune", "pack-refs", "filter-branch", "filter-repo"].includes(command)) {
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

export type DestructiveGitOperation = { operation: string; reason: string }

function hasFlag(args: readonly string[], short: string, long: string): boolean {
  return args.some((arg) =>
    arg === long || (/^-[A-Za-z]+$/.test(arg) && arg.slice(1).includes(short)),
  )
}

/** Detects Git operations that discard work or rewrite shared history. */
export function detectDestructiveGitOperation(
  command: string | readonly string[],
  context: Pick<GitCommandContext, "cwd">,
): DestructiveGitOperation | undefined {
  const words = tokenizeGitCommand(command)
  const { command: subcommand, args } = parseGitCommand(words)
  if (!subcommand) return undefined
  const result = (operation: string, reason: string) => ({ operation, reason })
  const action = firstPositional(args)

  switch (subcommand) {
    case "reset":
      return args.includes("--hard")
        ? result("git reset --hard", "Discards uncommitted changes in the working tree and index.")
        : undefined
    case "clean":
      return hasFlag(args, "f", "--force") && !hasFlag(args, "n", "--dry-run")
        ? result("git clean --force", "Permanently deletes untracked files.")
        : undefined
    case "push": {
      const force = hasFlag(args, "f", "--force")
      const deletes = hasAny(args, ["--delete", "-d", "--mirror", "--prune"]) ||
        args.some((arg) => /^:[^:]+$/.test(arg))
      const forcedRefspec = args.some((arg) => arg.startsWith("+") && arg.length > 1)
      return force || deletes || forcedRefspec
        ? result("git push --force/--delete", "Rewrites or deletes refs on the remote repository.")
        : undefined
    }
    case "stash":
      return action === "drop" || action === "clear"
        ? result(`git stash ${action}`, "Permanently removes saved stash entries.")
        : undefined
    case "checkout":
      return checkoutDiscardsChanges(words, args, context.cwd)
        ? result("git checkout <paths>", "Overwrites working-tree files and discards their uncommitted changes.")
        : undefined
    case "restore": {
      const stagedOnly = hasFlag(args, "S", "--staged") && !hasFlag(args, "W", "--worktree")
      return stagedOnly
        ? undefined
        : result("git restore <paths>", "Discards uncommitted changes in the selected working-tree paths.")
    }
    case "switch":
      return args.includes("--discard-changes") || hasFlag(args, "f", "--force")
        ? result("git switch --discard-changes", "Discards local changes while switching branches.")
        : undefined
    case "branch": {
      const forceDelete = args.some((arg) => /^-[A-Za-z]+$/.test(arg) && arg.includes("D")) ||
        (hasFlag(args, "d", "--delete") && hasFlag(args, "f", "--force"))
      return forceDelete
        ? result("git branch -D", "Force-deletes a branch even if it has unmerged commits.")
        : undefined
    }
    case "reflog":
      return action === "expire" || action === "delete"
        ? result(`git reflog ${action}`, "Removes the reflog entries used to recover lost commits.")
        : undefined
    case "gc":
      return args.some((arg) => arg === "--prune=now" || arg === "--prune=all")
        ? result("git gc --prune=now", "Immediately deletes unreachable objects that could otherwise be recovered.")
        : undefined
    case "prune":
      return result("git prune", "Permanently deletes unreachable objects.")
    case "filter-branch":
    case "filter-repo":
      return result(`git ${subcommand}`, "Rewrites repository history.")
    case "worktree":
      return args[0] === "remove" && hasFlag(args, "f", "--force")
        ? result("git worktree remove --force", "Deletes a worktree including its uncommitted changes.")
        : undefined
    case "update-ref":
      return args.includes("-d") ? result("git update-ref -d", "Deletes a Git reference.") : undefined
    case "rm":
      return hasFlag(args, "f", "--force") && !args.includes("--cached")
        ? result("git rm --force", "Deletes files even when they have uncommitted changes.")
        : undefined
    case "submodule":
      return args[0] === "deinit" && hasFlag(args, "f", "--force")
        ? result("git submodule deinit --force", "Removes a submodule working tree including local changes.")
        : undefined
  }
  return undefined
}

/**
 * `git checkout` discards changes when it targets paths instead of a branch:
 * `--` pathspecs, `.`, globs, relative paths, or names that exist on disk.
 */
function checkoutDiscardsChanges(words: readonly string[], args: readonly string[], cwd: string): boolean {
  if (hasFlag(args, "f", "--force")) return true
  const separator = args.indexOf("--")
  if (separator >= 0) return args.length > separator + 1

  const optionValues = new Set<number>()
  args.forEach((arg, index) => {
    if (["-b", "-B", "--orphan", "--conflict"].includes(arg)) optionValues.add(index + 1)
  })
  const directory = commandDirectory(words, cwd)
  return args.some((arg, index) => {
    if (arg.startsWith("-") || optionValues.has(index) || /^[0-9a-f]{7,40}$/i.test(arg)) return false
    if (arg === "." || arg.startsWith("./") || arg.startsWith("../") || /[*?[\]]/.test(arg)) return true
    return existsSync(resolve(directory, arg))
  })
}

/** Classifies direct Git invocations. Shell scripts and aliases intentionally fail closed as unknown. */
export function classifyGitCommand(
  command: string | readonly string[],
  context: GitCommandContext,
): GitCommandSafety {
  const words = tokenizeGitCommand(command)
  const parsed = parseGitCommand(words)
  const subcommandIndex = parsed.command === undefined ? words.length : words.length - parsed.args.length - 1
  const isDynamic = (word: string) => word.includes("$(") || word.includes("`")
  // A substituted subcommand or global option could be anything. Substituted
  // arguments are acceptable only for read-only commands; the nested command
  // itself is extracted and classified separately by the caller.
  const dynamicCommand = words.slice(1, subcommandIndex + 1).some(isDynamic)
  const dynamicArgs = parsed.args.some(isDynamic)
  const effect = dynamicCommand || (dynamicArgs && !READ_ONLY_COMMANDS.has(parsed.command ?? ""))
    ? "unknown"
    : classify(parsed.command, parsed.args)
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
