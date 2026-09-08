import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  classifyGitCommand,
  detectGitPathspecCwdMistake,
  extractGitInvocationsFromShell,
  hasUninspectableGitShell,
  parseGitCommand,
} from "./git-command-safety.ts"

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

test("inspects supported shell chains without flagging them as uninspectable", () => {
  const command = `git diff --unified=0 -- pi/extensions/damage-control.ts | awk '/^@@/{h=$0} /^[-+]/ {if ($0 !~ /^---|^\\+\\+\\+/) print h " " $0}' | rg -v '^[^ ]* ([-+]["\`A-Za-z0-9_;:,.(){} ]+)$' | head -200`
  assert.equal(hasUninspectableGitShell(command), false)
  assert.deepEqual(extractGitInvocationsFromShell(command), ["git diff --unified=0 -- pi/extensions/damage-control.ts"])
})

test("inspects multiple read-only Git commands mixed with shell output commands", () => {
  const backtick = "`"
  const command = `git log --all --oneline --decorate -- APPEND_SYSTEM.md README.md extensions/subagent/index.ts extensions/subagent/README.md extensions/lib/subagent-tools.test.ts | head -30; printf '\\nCurrent contents evidence:\\n'; rg -n 'Start subagents at ${backtick}low${backtick}|defaults? to ${backtick}low${backtick}|thinking: options\\.thinking \\?\\? "low"|thinking: task\\.thinking \\?\\? "low"' APPEND_SYSTEM.md README.md extensions/subagent/index.ts extensions/subagent/README.md extensions/lib/subagent-tools.test.ts; printf '\\nOrigin commit tree evidence:\\n'; git ls-tree -r --name-only origin/main -- pi/APPEND_SYSTEM.md pi/README.md pi/extensions/subagent/index.ts pi/extensions/subagent/README.md pi/extensions/lib/subagent-tools.test.ts | sed -n '1,30p'; git show origin/main:pi/extensions/subagent/index.ts | rg -n 'thinking: options\\.thinking \\?\\? "low"|thinking: task\\.thinking \\?\\? "low"'`
  assert.equal(hasUninspectableGitShell(command), false)
  assert.deepEqual(extractGitInvocationsFromShell(command), [
    "git log --all --oneline --decorate -- APPEND_SYSTEM.md README.md extensions/subagent/index.ts extensions/subagent/README.md extensions/lib/subagent-tools.test.ts",
    "git ls-tree -r --name-only origin/main -- pi/APPEND_SYSTEM.md pi/README.md pi/extensions/subagent/index.ts pi/extensions/subagent/README.md pi/extensions/lib/subagent-tools.test.ts",
    "git show origin/main:pi/extensions/subagent/index.ts",
  ])
})

test("classifies Git inspection inside a shell loop as read-only", () => {
  const command = `git log --format='%h %s' --reverse origin/main..HEAD && for c in $(git rev-list --reverse origin/main..HEAD); do echo ---$c; git show --stat --oneline --format=fuller $c | head -80; done`
  const invocations = extractGitInvocationsFromShell(command)
  assert.deepEqual(invocations, [
    "git log --format='%h %s' --reverse origin/main..HEAD",
    "git show --stat --oneline --format=fuller $c",
    "git rev-list --reverse origin/main..HEAD",
  ])
  for (const invocation of invocations) {
    assert.equal(classifyGitCommand(invocation, { cwd: "/repo" }).effect, "read-only", invocation)
  }
})

test("classifies branch containment and ref inspection as read-only", () => {
  const command = `git branch -a --contains c2abcba && printf '\\nrefs\\n' && git show-ref --heads --tags | head -50 && printf '\\nmain standup\\n' && git log --oneline main -5 2>/dev/null || true && printf '\\npackage slack deps\\n' && grep -n "slack\\|packageManager\\|typescript" package.json`
  assert.equal(hasUninspectableGitShell(command), false)
  const invocations = extractGitInvocationsFromShell(command)
  assert.deepEqual(invocations, [
    "git branch -a --contains c2abcba",
    "git show-ref --heads --tags",
    "git log --oneline main -5",
  ])
  for (const invocation of invocations) {
    assert.equal(classifyGitCommand(invocation, { cwd: "/repo" }).effect, "read-only", invocation)
  }
})

test("classifies branch, ref, and reflog inspection as read-only", () => {
  const command = `printf '%s\\n' 'Branches:'; git branch -a; printf '%s\\n' 'Refs:'; git for-each-ref --format='%(refname:short) %(objectname:short) %(subject)' | head -100; printf '%s\\n' 'Recent reflog:'; git reflog --all --date=iso -30`
  assert.equal(hasUninspectableGitShell(command), false)
  const invocations = extractGitInvocationsFromShell(command)
  assert.deepEqual(invocations, [
    "git branch -a",
    "git for-each-ref --format='%(refname:short) %(objectname:short) %(subject)'",
    "git reflog --all --date=iso -30",
  ])
  for (const invocation of invocations) {
    assert.equal(classifyGitCommand(invocation, { cwd: "/repo" }).effect, "read-only", invocation)
  }
})

test("distinguishes reflog inspection from mutating subcommands", () => {
  for (const command of ["git reflog --all --date=iso -30", "git reflog show HEAD", "git reflog list", "git reflog exists HEAD"]) {
    assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, "read-only", command)
  }
  for (const command of ["git reflog expire --all", "git reflog delete HEAD@{1}", "git reflog drop --all"]) {
    assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, "local-repository-mutation", command)
  }
})

test("keeps unsupported Git shell syntax fail-closed", () => {
  const cases = [
    "git grep needle <(git push origin HEAD)",
    "git grep needle $(git status; if true; then git push origin HEAD; fi)",
    "git status `git push origin HEAD`",
    "command git push origin HEAD",
    "! git push origin HEAD",
  ]
  for (const command of cases) {
    assert.equal(hasUninspectableGitShell(command), true, command)
  }
})

test("extracts supported Git executable paths, env prefixes, and substitutions", () => {
  const command = "env LC_ALL=C /opt/homebrew/bin/git status --short; /usr/bin/git log -1; printf '%s' \"$(git rev-parse HEAD)\""
  assert.equal(hasUninspectableGitShell(command), false)
  assert.deepEqual(extractGitInvocationsFromShell(command), [
    "/opt/homebrew/bin/git status --short",
    "/usr/bin/git log -1",
    "git rev-parse HEAD",
  ])
})

test("classifies Git commands inside supported substitutions", () => {
  const command = "printf '%s' \"$(git push origin HEAD)\""
  assert.equal(hasUninspectableGitShell(command), false)
  const invocations = extractGitInvocationsFromShell(command)
  assert.deepEqual(invocations, ["git push origin HEAD"])
  assert.equal(classifyGitCommand(invocations[0], { cwd: "/repo" }).effect, "external-or-remote-mutation")
})

test("does not classify a direct Git command with shell substitution as read-only", () => {
  const command = "git show $(git push origin HEAD)"
  assert.deepEqual(extractGitInvocationsFromShell(command), [
    "git show $(git push origin HEAD)",
    "git push origin HEAD",
  ])
  assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, "unknown")
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
