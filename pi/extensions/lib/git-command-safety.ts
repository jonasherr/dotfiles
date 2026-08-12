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

function shellWords(command: string): string[] {
  // This intentionally only tokenizes a single command. Shell operators make
  // the command ambiguous and are handled as unknown rather than guessed at.
  if (/[;&|`$()<>]/.test(command)) return []
  return command.match(/(?:"(?:\\.|[^"])*"|'[^']*'|\\.|[^\s])+/g)?.map(unquote) ?? []
}

function unquote(word: string): string {
  if ((word.startsWith("\"") && word.endsWith("\"")) || (word.startsWith("'") && word.endsWith("'"))) {
    return word.slice(1, -1).replace(/\\([\\"' ])/g, "$1")
  }
  return word.replace(/\\ /g, " ")
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
    "status", "diff", "log", "show", "grep", "blame", "rev-parse",
    "merge-base", "ls-files", "ls-tree", "cat-file", "version", "help",
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
  if (["push", "pull", "fetch", "clone", "ls-remote", "submodule"].includes(command)) {
    return command === "ls-remote" ? "read-only" : "external-or-remote-mutation"
  }
  if (["add", "rm", "mv", "commit", "checkout", "switch", "restore", "merge", "rebase", "cherry-pick", "revert", "reset"].includes(command)) {
    return "local-checkout-mutation"
  }
  if (["stash", "update-ref", "replace", "notes", "gc", "prune", "reflog", "pack-refs", "filter-branch"].includes(command)) {
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
