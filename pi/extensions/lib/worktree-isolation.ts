import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const DEFAULT_BRANCH_PREFIX = "pi/isolation"

export type WorktreeDirtyState = {
  dirty: boolean
  changedFiles: number
  stagedFiles: number
  unstagedFiles: number
  untrackedFiles: number
  conflictedFiles: number
}

export type WorktreeRecovery = {
  inspect: string
  list: string
  remove: string
}

export type WorktreeIsolation = {
  worktreePath: string
  childCwd: string
  branch: string
  baseCommit: string
  repositoryRoot: string
  repositoryHash: string
  dirtyState: WorktreeDirtyState
  recovery: WorktreeRecovery
}

export type CreateWorktreeIsolationOptions = {
  /** The requested child cwd in the primary checkout. */
  cwd: string
  /** Used only to make retained paths understandable to people. */
  sessionId?: string
  /** Used only to make retained paths understandable to people. */
  taskId?: string
  /** Override the durable root in tests or for an explicitly managed install. */
  worktreeRoot?: string
  branchPrefix?: string
}

export type WorktreeIsolationDependencies = {
  homedir: () => string
  randomId: () => string
  mkdir: typeof mkdir
  execute: (
    executable: string,
    args: string[],
    options: { cwd: string },
  ) => Promise<{ stdout: string; stderr?: string }>
}

const defaultDependencies: WorktreeIsolationDependencies = {
  homedir,
  randomId: randomUUID,
  mkdir,
  execute: async (executable, args, options) => {
    const result = await execFileAsync(executable, args, {
      cwd: options.cwd,
      shell: false,
    })
    return { stdout: result.stdout, stderr: result.stderr }
  },
}

export class WorktreeIsolationError extends Error {
  readonly code: "not-a-repository" | "dirty-primary-checkout" | "invalid-cwd" | "git-failed"
  readonly details: Partial<
    Pick<WorktreeIsolation, "repositoryRoot" | "baseCommit" | "dirtyState">
  >

  constructor(
    message: string,
    code: "not-a-repository" | "dirty-primary-checkout" | "invalid-cwd" | "git-failed",
    details: Partial<
      Pick<WorktreeIsolation, "repositoryRoot" | "baseCommit" | "dirtyState">
    > = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "WorktreeIsolationError"
    this.code = code
    this.details = details
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function safeSegment(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback)
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
  return normalized.slice(0, 48) || fallback
}

function isDescendant(root: string, target: string): boolean {
  const path = relative(root, target)
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  )
}

export function parseWorktreeDirtyState(status: string): WorktreeDirtyState {
  const files = status.split("\n").filter(Boolean)
  let stagedFiles = 0
  let unstagedFiles = 0
  let untrackedFiles = 0
  let conflictedFiles = 0

  for (const entry of files) {
    const index = entry[0] ?? " "
    const worktree = entry[1] ?? " "
    if (entry.startsWith("??")) {
      untrackedFiles++
      continue
    }
    if (index !== " ") stagedFiles++
    if (worktree !== " ") unstagedFiles++
    if (index === "U" || worktree === "U" || ["AA", "DD"].includes(`${index}${worktree}`)) {
      conflictedFiles++
    }
  }

  return {
    dirty: files.length > 0,
    changedFiles: files.length,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    conflictedFiles,
  }
}

async function git(
  dependencies: WorktreeIsolationDependencies,
  cwd: string,
  args: string[],
): Promise<string> {
  try {
    const result = await dependencies.execute("git", args, { cwd })
    return result.stdout.trimEnd()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new WorktreeIsolationError(`Git command failed: git ${args.join(" ")}: ${message}`, "git-failed", {}, { cause: error })
  }
}

/**
 * Creates a retained linked worktree. This intentionally has no cleanup API:
 * callers must surface recovery metadata rather than risk removing work.
 */
export async function createWorktreeIsolation(
  options: CreateWorktreeIsolationOptions,
  overrides: Partial<WorktreeIsolationDependencies> = {},
): Promise<WorktreeIsolation> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const requestedCwd = await realpath(resolve(options.cwd))
  let repositoryRoot: string
  try {
    repositoryRoot = await git(dependencies, requestedCwd, [
      "rev-parse",
      "--show-toplevel",
    ])
  } catch (error) {
    if (error instanceof WorktreeIsolationError) {
      throw new WorktreeIsolationError(
        `Worktree isolation requires a Git repository at ${requestedCwd}.`,
        "not-a-repository",
        {},
        { cause: error },
      )
    }
    throw error
  }
  repositoryRoot = await realpath(resolve(repositoryRoot))

  if (!isDescendant(repositoryRoot, requestedCwd)) {
    throw new WorktreeIsolationError(
      `Requested cwd ${requestedCwd} is outside repository ${repositoryRoot}.`,
      "invalid-cwd",
      { repositoryRoot },
    )
  }

  const [baseCommit, status] = await Promise.all([
    git(dependencies, repositoryRoot, ["rev-parse", "HEAD"]),
    git(dependencies, repositoryRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
  ])
  const dirtyState = parseWorktreeDirtyState(status)
  if (dirtyState.dirty) {
    throw new WorktreeIsolationError(
      "Refusing worktree isolation because the primary checkout is dirty; do not silently omit tracked, staged, conflicted, or untracked task input.",
      "dirty-primary-checkout",
      { repositoryRoot, baseCommit, dirtyState },
    )
  }

  const repositoryHash = createHash("sha256")
    .update(repositoryRoot)
    .digest("hex")
    .slice(0, 16)
  const durableRoot = options.worktreeRoot ?? join(dependencies.homedir(), ".pi", "agent", "worktrees")
  const owner = `${safeSegment(options.sessionId, "session")}-${safeSegment(options.taskId, "task")}`
  const nonce = safeSegment(dependencies.randomId(), "worktree").slice(0, 24)
  const worktreePath = join(durableRoot, repositoryHash, `${owner}-${nonce}`)
  const branch = `${options.branchPrefix ?? DEFAULT_BRANCH_PREFIX}/${owner}-${nonce}`
  await dependencies.mkdir(dirname(worktreePath), { recursive: true, mode: 0o700 })

  await git(dependencies, repositoryRoot, [
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
    baseCommit,
  ])

  const childCwd = join(worktreePath, relative(repositoryRoot, requestedCwd))
  return {
    worktreePath,
    childCwd,
    branch,
    baseCommit,
    repositoryRoot,
    repositoryHash,
    dirtyState,
    recovery: {
      inspect: `git -C ${shellQuote(worktreePath)} status`,
      list: `git -C ${shellQuote(repositoryRoot)} worktree list`,
      remove: `git -C ${shellQuote(repositoryRoot)} worktree remove ${shellQuote(worktreePath)}`,
    },
  }
}

export async function inspectWorktreeDirtyState(
  worktreePath: string,
  overrides: Partial<WorktreeIsolationDependencies> = {},
): Promise<WorktreeDirtyState> {
  const dependencies = { ...defaultDependencies, ...overrides }
  const status = await git(dependencies, worktreePath, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ])
  return parseWorktreeDirtyState(status)
}

export const worktreeIsolationConstants = {
  defaultBranchPrefix: DEFAULT_BRANCH_PREFIX,
  defaultRootRelativePath: join(".pi", "agent", "worktrees"),
}
