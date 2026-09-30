import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  classifyGitCommand,
  detectDestructiveGitOperation,
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

test("classifies read-only commands with substitutions and separately inspects nested commands", () => {
  const command = "git show $(git push origin HEAD)"
  const invocations = extractGitInvocationsFromShell(command)
  assert.deepEqual(invocations, ["git show $(git push origin HEAD)", "git push origin HEAD"])
  assert.equal(classifyGitCommand(invocations[0], { cwd: "/repo" }).effect, "read-only")
  assert.equal(classifyGitCommand(invocations[1], { cwd: "/repo" }).effect, "external-or-remote-mutation")
})

test("handles transparent shell prefixes, groups, and known data commands", () => {
  const safe = [
    "which git", "command -v git >/dev/null && git status --short", "rg -n git src", "ls ~/.config/git",
    "brew info git", "GIT_PAGER=cat git log --oneline -5", "if git diff --quiet; then echo clean; else git status; fi",
    "for c in a b; do git show --stat $c; done", "(cd nvim && git status --short)",
    "{ git status --short; git log -1 --oneline; } 2>&1 | head -20", "time git status",
    "if ! git diff --quiet; then echo dirty; fi", "git -C ${HOME}/x status",
    "env -i A=b git status", "nice -n 5 git status", "nohup git status", "timeout 5 git status",
    "bash -lc 'git push origin main'",
  ]
  for (const command of safe) assert.equal(hasUninspectableGitShell(command), false, command)
  assert.deepEqual(extractGitInvocationsFromShell("which git; command -v git; rg -n git src; brew info git"), [])
  assert.deepEqual(extractGitInvocationsFromShell("GIT_PAGER=cat git log --oneline -5; for c in a b; do git show --stat $c; done"), ["git log --oneline -5", "git show --stat $c"])
  assert.deepEqual(extractGitInvocationsFromShell("bash -lc 'git push origin main'"), ["git push origin main"])
})

test("keeps unknown Git executors and unsupported syntax fail-closed", () => {
  for (const command of ["xargs git push", "sudo git push", "find . -exec git add {} \\\;", "git status <(git push)", "watch git status", "mise exec -- git push origin HEAD"]) {
    assert.equal(hasUninspectableGitShell(command), true, command)
  }
})

test("classifies read-only Git command families and mutation boundaries", () => {
  const read = ["git --version", "git --help", "git -h", "git version", "git help status", "git --exec-path", "git describe", "git shortlog", "git name-rev HEAD", "git cherry", "git range-diff a b", "git whatchanged", "git show-branch", "git count-objects", "git fsck", "git verify-commit HEAD", "git verify-tag v1", "git var GIT_EDITOR", "git diff-tree HEAD", "git diff-index HEAD", "git diff-files", "git check-attr x -- file", "git check-ref-format main", "git check-mailmap A", "git annotate file", "git patch-id", "git get-tar-commit-id", "git stash list", "git stash show", "git notes list", "git notes show", "git bisect log", "git bisect view", "git bisect visualize", "git submodule status", "git submodule summary", "git symbolic-ref HEAD", "git apply --check patch", "git format-patch --stdout HEAD", "git archive HEAD"]
  for (const command of read) assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, "read-only", command)
  const effects: Array<[string, string]> = [
    ["git config user.email", "read-only"], ["git config user.email x@y", "external-or-remote-mutation"],
    ["git config --global --show-origin user.email", "read-only"], ["git fetch", "local-repository-mutation"],
    ["git init -q", "local-repository-mutation"],
    ["git pull", "local-checkout-mutation"], ["git clone x", "local-checkout-mutation"],
    ["git submodule foreach git status", "unknown"], ["git submodule update", "local-checkout-mutation"],
    ["git remote -v", "read-only"], ["git remote add origin x", "local-repository-mutation"],
    ["git symbolic-ref HEAD refs/heads/x", "local-repository-mutation"], ["git apply --index patch", "local-checkout-mutation"],
    ["git diff --output=x", "local-checkout-mutation"], ["git log --output x", "local-checkout-mutation"],
    ["git grep -n pattern $(git for-each-ref --format='%(refname)' refs/remotes/origin) -- ':!pnpm-lock.yaml'", "read-only"],
    ["git status $(git push)", "read-only"],
  ]
  for (const [command, effect] of effects) assert.equal(classifyGitCommand(command, { cwd: "/repo" }).effect, effect, command)
})

test("detects explicitly destructive Git operations", async () => {
  const positives = ["git -C . reset --hard", "git -c a=b clean -fdx", "git checkout -- .gitignore", "git checkout .", "git restore src/x.ts", "git stash drop", "git branch -D old", "git push origin +main", "git push origin :old"]
  for (const command of positives) assert.ok(detectDestructiveGitOperation(command, { cwd: process.cwd() }), command)
  const negatives = ["git push --follow-tags origin main", "git push origin feature-fix", "git push --force-with-lease", "git restore --staged x", "git log --grep=\"reset --hard\"", "git checkout main", "git checkout -b feature", "git checkout v1.2.3"]
  for (const command of negatives) assert.equal(detectDestructiveGitOperation(command, { cwd: process.cwd() }), undefined, command)
  const root = await mkdtemp(join(tmpdir(), "git-command-safety-"))
  await writeFile(join(root, "src.ts"), "x")
  assert.ok(detectDestructiveGitOperation("git checkout src.ts", { cwd: root }))
  assert.ok(detectDestructiveGitOperation("git -C . checkout src.ts", { cwd: root }))
})

test("treats newlines as command separators", () => {
  const command = "git status --short\ngit push origin main"
  assert.deepEqual(extractGitInvocationsFromShell(command), ["git status --short", "git push origin main"])
  assert.equal(classifyGitCommand("git push origin main", { cwd: "/repo" }).effect, "external-or-remote-mutation")
})

test("keeps Git text piped into a shell fail-closed", () => {
  for (const command of ["echo git push origin main | sh", "printf 'git push' | bash"]) {
    assert.equal(hasUninspectableGitShell(command), true, command)
  }
})

test("classifies git clean dry runs as read-only and forced cleans as destructive", () => {
  assert.equal(classifyGitCommand("git clean -nd", { cwd: "/repo" }).effect, "read-only")
  assert.equal(detectDestructiveGitOperation("git clean -nd", { cwd: "/repo" }), undefined)
  assert.equal(detectDestructiveGitOperation("git clean -fd", { cwd: "/repo" })?.operation, "git clean --force")
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
