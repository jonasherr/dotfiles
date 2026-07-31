import assert from "node:assert/strict"
import { mkdtemp, mkdir, symlink } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { detectDestructiveShellRisk } from "./damage-control-safety.ts"

test("hard-blocks recursive deletion through an unset or ordinary variable", async () => {
  for (const command of [
    'rm -rf "$TARGET"',
    'rm -rf "${TARGET}"',
    'rm --recursive --force "$TARGET/cache"',
    'TARGET=""; rm -rf "$TARGET"/*',
  ]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, true, command)
    assert.match(risk?.category ?? "", /variable-expanded/)
  }
})

test("hard-blocks home and root spellings", async () => {
  for (const command of ["rm -rf ~", "rm -rf ~/", "rm -rf /", "rm -rf '/*'", "rm \\\n-rf /"]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, true, command)
  }
})

test("hard-blocks the active workspace even through a symlink alias", async () => {
  const root = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  const workspace = join(root, "workspace")
  const alias = join(root, "alias")
  await mkdir(workspace)
  await symlink(workspace, alias)

  for (const command of ["rm -rf .", `rm -rf ${alias}`]) {
    const risk = await detectDestructiveShellRisk(command, workspace)
    assert.equal(risk?.hardBlock, true, command)
    assert.match(risk?.matched ?? "", /active workspace/)
  }
})

test("hard-blocks a literal alias that resolves to home", async () => {
  const root = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  const alias = join(root, "home-alias")
  await symlink(homedir(), alias)
  const risk = await detectDestructiveShellRisk(`rm -rf ${alias}`, root)
  assert.equal(risk?.hardBlock, true)
  assert.match(risk?.matched ?? "", /home directory/)
})

test("allows approval for a narrow literal recursive cleanup", async () => {
  for (const command of ["rm -rf ./dist", "rm -rf ~/Library/Caches/example", 'rm -rf ./dist && echo "$HOME"']) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, undefined, command)
    assert.equal(risk?.category, "Recursive or bulk deletion", command)
  }
})

test("hard-blocks wrappers and computed catastrophic targets", async () => {
  for (const command of ["/bin/rm -rf /", "env rm -rf /", 'rm -rf "$(pwd)"', "rm -rf `pwd`"]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, true, command)
  }
})

test("allows approval for fail-closed variable expansion", async () => {
  const risk = await detectDestructiveShellRisk('rm -rf "${TARGET:?TARGET must be set}/dist"', "/tmp/project")
  assert.equal(risk?.hardBlock, undefined)
  assert.equal(risk?.category, "Recursive or bulk deletion")
})

test("flags alternate recursive deletion mechanisms", async () => {
  for (const command of [
    "find ./tmp -type f -delete",
    "python -c 'import shutil; shutil.rmtree(\"tmp\")'",
    "node -e 'require(\"fs\").rmSync(\"tmp\", { recursive: true })'",
    "rsync -a --delete src/ dest/",
    "Remove-Item ./tmp -Recurse -Force",
  ]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.ok(risk, command)
  }
})

test("does not flag standalone TemporaryDirectory construction or cleanup", async () => {
  for (const command of [
    "python -c 'import tempfile; tempfile.TemporaryDirectory()'",
    "python -c 'import tempfile; tempfile.TemporaryDirectory().cleanup()'",
    "unshare -m python -c 'import tempfile; tempfile.TemporaryDirectory()'",
  ]) {
    assert.equal(await detectDestructiveShellRisk(command, "/tmp/project"), undefined, command)
  }
})

test("retains recursive Python and namespace cleanup detection", async () => {
  for (const command of [
    "python -c 'import shutil; shutil.rmtree(\"/tmp/job\")'",
    "unshare -m python -c 'with tempfile.TemporaryDirectory() as d: shutil.rmtree(d)'",
  ]) {
    assert.ok(await detectDestructiveShellRisk(command, "/tmp/project"), command)
  }
})

test("does not flag ordinary non-destructive commands", async () => {
  for (const command of ["npm test", "git status", "rm ./one-file.tmp", "find src -type f -print"]) {
    assert.equal(await detectDestructiveShellRisk(command, "/tmp/project"), undefined, command)
  }
})
