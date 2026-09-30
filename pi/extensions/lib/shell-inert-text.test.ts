import assert from "node:assert/strict"
import test from "node:test"

import { maskInertShellText, parseShell } from "./shell-inert-text.ts"

test("masks search patterns, messages, comments, and data heredocs", () => {
  const cases: Array<[string, string]> = [
    ['rg -n "rm -rf|sudo " extensions/', "rg '' '' ''"],
    ["rg -n mktemp extensions/", "rg '' '' ''"],
    ['git commit -m "pi: replace mktemp and sudo"', "git commit -m ''"],
    ['git log --oneline --grep="reset --hard" -20', "git log --oneline '' -20"],
    ["echo foo # rm -rf /", "echo '' "],
    ["cat > notes.md <<'EOF'\nrm -rf /\nEOF", "cat > notes.md <<'EOF'\nEOF"],
    ["git commit -F - <<'EOF'\nDROP TABLE users;\nEOF", "git commit -F - <<'EOF'\nEOF"],
    ['gh pr create --title "Drop sudo" --body "rm -rf docs"', "gh pr create --title '' --body ''"],
  ]
  for (const [command, expected] of cases) {
    assert.equal(maskInertShellText(command), expected, command)
  }
})

test("keeps executed code visible", () => {
  for (const command of [
    'echo "$(rm -rf dist)"',
    "echo `rm -rf dist`",
    'echo "rm -rf dist" | sh',
    'echo "DROP TABLE users" | psql',
    'printf "rm -rf build" > x.sh && bash x.sh',
    "cat > x.sh <<'EOF'\nrm -rf build\nEOF\n./x.sh",
    "cat <<EOF | sh\nrm -rf x\nEOF",
    "cat <<EOF\n$(rm -rf x)\nEOF",
    "rg --pre 'rm -rf build' foo",
    'git -c alias.x="!rm -rf ~" x',
    'git rebase -x "rm -rf dist" main',
    '{ echo "DROP TABLE x"; echo y; } | psql',
    '{ echo "DROP TABLE x"; } 2>&1 | psql',
    '(echo "DROP TABLE x") | psql',
    'bash -c "rm -rf dist"',
    'ssh host "rm -rf /srv/app"',
  ]) {
    const masked = maskInertShellText(command)
    assert.match(masked, /rm -rf|DROP TABLE/, command)
  }
})

test("never masks redirect targets", () => {
  assert.equal(maskInertShellText('echo "x" > "/tmp/out.txt"'), `echo '' > "/tmp/out.txt"`)
  assert.equal(maskInertShellText("rg foo > /tmp/rg.txt"), "rg '' > /tmp/rg.txt")
})

test("returns the original command when parsing is not confident", () => {
  for (const command of ['echo "rm -rf /', "cat <<EOF\nrm -rf /", "echo $(rm -rf /"]) {
    assert.equal(maskInertShellText(command), command, command)
  }
})

test("splits segments on operators, newlines, subshells, and groups", () => {
  const parsed = parseShell("(cd app && git status); { git log -1; } 2>&1 | head\ngit diff")
  assert.equal(parsed.confident, true)
  assert.deepEqual(
    parsed.segments.map((segment) => segment.words.map(({ value }) => value).join(" ")),
    // The empty segment carries the group's `2>&1` redirect.
    ["cd app", "git status", "git log -1", "", "head", "git diff"],
  )
  assert.equal(parsed.groupPiped, true)
})
