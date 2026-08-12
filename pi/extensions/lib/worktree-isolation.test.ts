import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import test, { type TestContext } from "node:test"
import { promisify } from "node:util"

import {
  createWorktreeIsolation,
  parseWorktreeDirtyState,
  WorktreeIsolationError,
  worktreeIsolationConstants,
} from "./worktree-isolation.ts"

const execFileAsync = promisify(execFile)

test("counts every porcelain v1 unmerged state as conflicted", () => {
  for (const state of ["DD", "AU", "UD", "UA", "DU", "AA", "UU"]) {
    assert.equal(parseWorktreeDirtyState(`${state} file.txt\n`).conflictedFiles, 1)
  }
})

async function git(cwd: string, args: string[]) {
  return execFileAsync("git", args, { cwd, shell: false })
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "worktree-isolation-test-"))
  const repository = join(root, "repository")
  const durableRoot = join(root, "durable-worktrees")
  await mkdir(repository)
  await git(repository, ["init"])
  await git(repository, ["config", "user.email", "test@example.invalid"])
  await git(repository, ["config", "user.name", "Test User"])
  await writeFile(join(repository, "README.md"), "base\n")
  await mkdir(join(repository, "nested"))
  await writeFile(join(repository, "nested", "input.txt"), "nested\n")
  await git(repository, ["add", "."])
  await git(repository, ["commit", "-m", "base"])
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, repository, durableRoot }
}

test("creates a durable linked worktree from HEAD and preserves nested cwd", async (t) => {
  const { repository, durableRoot } = await fixture(t)
  const isolation = await createWorktreeIsolation({
    cwd: join(repository, "nested"),
    worktreeRoot: durableRoot,
    sessionId: "session-1",
    taskId: "implement nested change",
  })

  assert.equal(isolation.childCwd, join(isolation.worktreePath, "nested"))
  assert.equal(isolation.dirtyState.dirty, false)
  assert.match(isolation.branch, /^pi\/isolation\/session-1-implement-nested-change-/)
  assert.equal(relative(durableRoot, isolation.worktreePath).split("/").length, 2)
  assert.match(isolation.recovery.inspect, /git -C/)
  assert.match(isolation.recovery.list, /worktree list/)
  assert.match(isolation.recovery.remove, /worktree remove/)

  await writeFile(join(isolation.childCwd, "only-in-worktree.txt"), "isolated\n")
  await assert.rejects(
    readFile(join(repository, "nested", "only-in-worktree.txt")),
    /ENOENT/,
  )
  const status = await git(repository, ["status", "--porcelain"])
  assert.equal(status.stdout, "")
})

test("parallel tasks receive distinct checkouts and do not share working-tree changes", async (t) => {
  const { repository, durableRoot } = await fixture(t)
  const [first, second] = await Promise.all(
    ["one", "two"].map((taskId) =>
      createWorktreeIsolation({
        cwd: repository,
        worktreeRoot: durableRoot,
        sessionId: "same-session",
        taskId,
      }),
    ),
  )
  assert.notEqual(first.worktreePath, second.worktreePath)
  assert.notEqual(first.branch, second.branch)
  await writeFile(join(first.worktreePath, "private.txt"), "first\n")
  const secondStatus = await git(second.worktreePath, ["status", "--porcelain"])
  const primaryStatus = await git(repository, ["status", "--porcelain"])
  assert.equal(secondStatus.stdout, "")
  assert.equal(primaryStatus.stdout, "")
})

test("refuses dirty primary checkout without stashing, copying, or cleanup", async (t) => {
  const { repository, durableRoot } = await fixture(t)
  await writeFile(join(repository, "untracked-task-input.txt"), "important\n")
  await assert.rejects(
    createWorktreeIsolation({ cwd: repository, worktreeRoot: durableRoot }),
    (error: unknown) => {
      assert.ok(error instanceof WorktreeIsolationError)
      assert.equal(error.code, "dirty-primary-checkout")
      assert.equal(error.details.dirtyState?.untrackedFiles, 1)
      return true
    },
  )
  const status = await git(repository, ["status", "--porcelain"])
  assert.equal(status.stdout, "?? untracked-task-input.txt\n")
})

test("uses fixed git argv and permits a configurable durable root", async (t) => {
  const { repository, durableRoot } = await fixture(t)
  const calls: string[][] = []
  const isolation = await createWorktreeIsolation(
    { cwd: repository, worktreeRoot: durableRoot, sessionId: "s", taskId: "t" },
    {
      randomId: () => "stable-id",
      execute: async (executable, args, options) => {
        assert.equal(executable, "git")
        calls.push(args)
        const result = await execFileAsync(executable, args, {
          cwd: options.cwd,
          shell: false,
        })
        return { stdout: result.stdout, stderr: result.stderr }
      },
    },
  )
  assert.equal(isolation.worktreePath, join(durableRoot, isolation.repositoryHash, "s-t-stable-id"))
  assert.deepEqual(calls.at(-1)?.slice(0, 4), ["worktree", "add", "-b", isolation.branch])
  assert.equal(worktreeIsolationConstants.defaultRootRelativePath, ".pi/agent/worktrees")
})
