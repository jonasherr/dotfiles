import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { classifyGitCommand, detectGitPathspecCwdMistake, parseGitCommand } from "./git-command-safety.ts"

test("classifies Git reads, local changes, remote changes, and unknown commands", () => {
  const cases: Array<[string, string]> = [
    ["git -C nested status --short", "read-only"],
    ["git diff -- src/file.ts", "read-only"],
    ["git add src/file.ts", "local-checkout-mutation"],
    ["git stash pop", "local-repository-mutation"],
    ["git branch -D old", "local-repository-mutation"],
    ["git push origin main", "external-or-remote-mutation"],
    ["git frobnicate", "unknown"],
  ]
  for (const [command, effect] of cases) {
    assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, effect, command)
  }
})

test("handles Git global options and detects the primary checkout target", () => {
  assert.deepEqual(parseGitCommand("git -c core.fsmonitor=false --git-dir=.git --work-tree=. status"), { command: "status", args: [] })
  const result = classifyGitCommand("git -C /primary commit -m message", {
    cwd: "/worktree",
    primaryCheckout: "/primary",
    isolatedTask: true,
  })
  assert.equal(result.targetsPrimaryCheckout, true)
  assert.match(result.remediation, /isolated worktree/)
})

test("warns about a root-relative pathspec from a nested working directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-command-safety-"))
  const nested = join(root, "packages", "app")
  await mkdir(join(root, "src"), { recursive: true })
  await mkdir(nested, { recursive: true })
  await writeFile(join(root, "src", "index.ts"), "export {}\n")
  // A minimal Git directory is enough because this test only exercises the fixed Git root command.
  const { execFile } = await import("node:child_process")
  await new Promise<void>((resolve, reject) => execFile("git", ["init", "-q", root], (error) => error ? reject(error) : resolve()))
  const warning = await detectGitPathspecCwdMistake("git diff -- src/index.ts", { cwd: nested })
  assert.equal(warning?.path, "src/index.ts")
  assert.match(warning?.remediation ?? "", /\.\.\/\.\.\/src\/index\.ts/)
  assert.equal(await detectGitPathspecCwdMistake("git diff -- :(top)src/index.ts", { cwd: nested }), undefined)
})
