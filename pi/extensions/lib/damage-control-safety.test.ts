import assert from "node:assert/strict"
import { mkdtemp, mkdir, symlink } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  detectDestructiveShellRisk,
  detectTemporaryPathWrite,
  detectTemporaryShellWrite,
} from "./damage-control-safety.ts"

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
  for (const command of [
    "rm -rf ~",
    "rm -rf ~/",
    "rm -rf /",
    "rm -rf '/*'",
    "rm \\\n-rf /",
  ]) {
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
  for (const command of [
    "rm -rf ./dist",
    "rm -rf ~/Library/Caches/example",
    'rm -rf ./dist && echo "$HOME"',
  ]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, undefined, command)
    assert.equal(risk?.category, "Recursive or bulk deletion", command)
  }
})

test("hard-blocks wrappers and computed catastrophic targets", async () => {
  for (const command of [
    "/bin/rm -rf /",
    "env rm -rf /",
    'rm -rf "$(pwd)"',
    "rm -rf `pwd`",
  ]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, true, command)
  }
})

test("allows approval for fail-closed variable expansion", async () => {
  const risk = await detectDestructiveShellRisk(
    'rm -rf "${TARGET:?TARGET must be set}/dist"',
    "/tmp/project",
  )
  assert.equal(risk?.hardBlock, undefined)
  assert.equal(risk?.category, "Recursive or bulk deletion")
})

test("flags alternate recursive deletion mechanisms", async () => {
  for (const command of [
    "find ./tmp -type f -delete",
    "python -c 'import shutil; shutil.rmtree(\"tmp\")'",
    'node -e \'require("fs").rmSync("tmp", { recursive: true })\'',
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
    assert.equal(
      await detectDestructiveShellRisk(command, "/tmp/project"),
      undefined,
      command,
    )
  }
})

test("retains recursive Python and namespace cleanup detection", async () => {
  for (const command of [
    "python -c 'import shutil; shutil.rmtree(\"/tmp/job\")'",
    "unshare -m python -c 'with tempfile.TemporaryDirectory() as d: shutil.rmtree(d)'",
  ]) {
    assert.ok(
      await detectDestructiveShellRisk(command, "/tmp/project"),
      command,
    )
  }
})

test("hard-blocks unmanaged temporary file and directory creation", () => {
  for (const command of [
    "mktemp -d",
    "DIR=$(mktemp -d)",
    "/usr/bin/mktemp -d",
    "mkdir -p /tmp/build-output",
    "mkdir ./tmp",
    "cat > /tmp/message.html <<'EOF'\nhello\nEOF",
    "printf ok >> ./tmp/result.txt",
    "echo ok | tee ../../temp/result.txt",
    "curl -fsSL https://example.com -o /tmp/page.html",
    "wget --output-document=./tmp/page.html https://example.com",
    "bun build src.ts --outdir=/tmp/pi-build",
    "cargo build --target-dir /tmp/cargo-build",
    "dd if=/dev/zero of=/tmp/image.bin",
    "truncate -s 1M /tmp/image.bin",
    "unzip archive.zip -d /tmp/unpacked",
    "tar -xf archive.tar -C /tmp/unpacked",
    "T=/tmp/result.log; printf ok > $T",
    "command > $TMPDIR/result.log",
    "python -c 'import tempfile; tempfile.TemporaryDirectory()'",
    'node -e \'require("fs").mkdtempSync("/tmp/job-")\'',
    'node -e \'fs.writeFileSync("/tmp/result.txt", "ok")\'',
  ]) {
    const risk = detectTemporaryShellWrite(command)
    assert.equal(risk?.hardBlock, true, command)
    assert.match(risk?.remediation ?? "", /piping commands or using stdout/)
    assert.match(risk?.remediation ?? "", /temporary_workspace_create/)
    assert.match(risk?.remediation ?? "", /temporary_workspace_delete/)
    assert.match(risk?.remediation ?? "", /autogenerated ID/)
  }
})

test("hard-blocks unmanaged temporary paths for file tools", () => {
  for (const path of [
    "/tmp/report.txt",
    "/private/tmp/report.txt",
    "./tmp/report.txt",
    "../../temp/report.txt",
    "$TMPDIR/report.txt",
  ]) {
    assert.equal(detectTemporaryPathWrite(path)?.hardBlock, true, path)
  }

  assert.equal(
    detectTemporaryPathWrite(
      "/tmp/pi-managed-workspaces/workspace-abc123/report.txt",
    ),
    undefined,
  )
  assert.equal(
    detectTemporaryPathWrite(
      "/tmp/pi-managed-workspaces/workspace-abc123/../../../.ssh/authorized_keys",
    )?.hardBlock,
    true,
  )
  assert.equal(detectTemporaryPathWrite("attempt/result.txt"), undefined)
})

test("allows managed workspace writes, temporary-path reads, cleanup, and non-temporary output", () => {
  for (const command of [
    "cat /tmp/existing.txt",
    "cp /tmp/existing.txt ./result.txt",
    "mv /tmp/existing.txt ./result.txt",
    "test -s ./tmp/result.json",
    "find tmp -type f -print",
    "rm ./one-file.tmp",
    "rm -rf ./tmp",
    "curl -fsSL https://example.com | jq .",
    "printf ok > ./result.txt",
    "mkdir ./fixtures",
    "bun build src.ts --outdir=./dist",
    "printf ok > /tmp/pi-managed-workspaces/workspace-abc123/result.txt",
  ]) {
    assert.equal(detectTemporaryShellWrite(command), undefined, command)
  }
})

test("does not flag ordinary non-destructive commands", async () => {
  for (const command of [
    "npm test",
    "git status",
    "rm ./one-file.tmp",
    "find src -type f -print",
  ]) {
    assert.equal(
      await detectDestructiveShellRisk(command, "/tmp/project"),
      undefined,
      command,
    )
  }
})
