import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  detectDestructiveShellRisk,
  detectTemporaryPathWrite,
  detectTemporaryShellWrite,
  TEMPORARY_WORKSPACE_POLICY,
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
    "rm -rf ./generated",
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

test("uses one explicit temporary workspace policy in remediation", () => {
  const risk = detectTemporaryShellWrite("mktemp -d")
  assert.equal(risk?.remediation?.startsWith(TEMPORARY_WORKSPACE_POLICY), true)
  assert.match(risk?.remediation ?? "", /external tool creates artifacts/)
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
    assert.match(risk?.remediation ?? "", /stdout or pipes/)
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

test("allows deleting regenerable artifacts without approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  for (const command of [
    "rm -rf node_modules",
    "rm -rf .next node_modules .turbo",
    "rm -rf apps/web/.next",
    "rm -rf packages/*/node_modules",
    "rm -rf node_modules/.cache",
    "npx rimraf node_modules .next",
    "rm -rf __pycache__ .pytest_cache",
    "find . -name node_modules -type d -prune -exec rm -rf {} +",
    "find . -name '*.pyc' -delete",
    "find . -name .DS_Store -delete",
    "rm -rf ~/Library/Caches/example",
  ]) {
    assert.equal(await detectDestructiveShellRisk(command, root), undefined, command)
  }
})

test("allows deleting build output only when Git ignores it", async () => {
  const root = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  await new Promise<void>((resolve, reject) =>
    execFile("git", ["init", "-q", root], (error) => (error ? reject(error) : resolve())),
  )
  await writeFile(join(root, ".gitignore"), "dist/\ncoverage\n")
  await mkdir(join(root, "dist"))
  assert.equal(await detectDestructiveShellRisk("rm -rf dist coverage", root), undefined)
  assert.equal((await detectDestructiveShellRisk("rm -rf build", root))?.category, "Recursive or bulk deletion")

  // A preceding cd changes what `dist` means, so it is checked where it runs.
  const other = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  const spaced = join(other, "with space")
  await mkdir(join(spaced, "dist"), { recursive: true })
  await mkdir(join(root, "app"))
  assert.equal(await detectDestructiveShellRisk("cd app && rm -rf dist", root), undefined)
  for (const command of [
    `cd ${other} && rm -rf dist`,
    `cd "${spaced}" && rm -rf dist`,
    "cd - && rm -rf dist",
    "(cd app) && rm -rf dist",
  ]) {
    assert.equal((await detectDestructiveShellRisk(command, root))?.category, "Recursive or bulk deletion", command)
  }
  assert.equal(await detectDestructiveShellRisk("cd app && rm -rf node_modules .next", root), undefined)
  const findFromHome = "cd ~ && find . -name node_modules -type d -prune -exec rm -rf {} +"
  assert.equal((await detectDestructiveShellRisk(findFromHome, root))?.category, "Recursive or bulk deletion")
})

test("still asks when a deletion reaches beyond regenerable artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  await mkdir(join(root, "real"))
  await symlink(join(root, "real"), join(root, ".next"))
  for (const command of [
    "rm -rf node_modules src",
    "rm -rf node_modules/../src",
    "rm -rf .next/",
    "rm -rf dist",
    "rm -rf packages/*/node_modules/",
    "rm -rf node_modules*",
    "find . -name node_modules -o -name src -exec rm -rf {} +",
    "find / -name node_modules -type d -prune -exec rm -rf {} +",
    "find . -name src -type d -exec rm -rf {} +",
    "find . -name node_modules -exec rm -rf {} + -o -delete",
    "ls | xargs rm -rf",
    "rm -rf ~/Library/Caches",
  ]) {
    const risk = await detectDestructiveShellRisk(command, root)
    assert.equal(risk?.category, "Recursive or bulk deletion", command)
  }
  assert.equal((await detectDestructiveShellRisk("npx rimraf ~", root))?.hardBlock, true)
  assert.equal((await detectDestructiveShellRisk("rm -rf node_modules ~", root))?.hardBlock, true)
})

test("asks when symlinks or find options lead outside the workspace", async () => {
  const base = await mkdtemp(join(tmpdir(), "damage-control-test-"))
  const project = join(base, "project")
  const important = join(base, "important with space")
  await mkdir(join(important, "node_modules"), { recursive: true })
  await mkdir(join(project, "packages", "real", "node_modules"), { recursive: true })
  await symlink(important, join(project, "packages", "linked"))
  await symlink(important, join(project, "external"))
  await writeFile(join(important, ".gitignore"), "")

  for (const command of [
    "rm -rf packages/*/node_modules",
    "rm -rf external/node_modules",
    "find -L / -name node_modules -exec rm -rf {} +",
    "find -L external -name node_modules -exec rm -rf {} +",
    "find external/ -name node_modules -exec rm -rf {} +",
    "find . -follow -name node_modules -exec rm -rf {} +",
    `cd "${important}" && rm -rf dist`,
  ]) {
    const risk = await detectDestructiveShellRisk(command, project)
    assert.equal(risk?.category, "Recursive or bulk deletion", command)
  }
  assert.equal(await detectDestructiveShellRisk("rm -rf packages/real/node_modules", project), undefined)
  assert.equal(await detectDestructiveShellRisk("find packages -name node_modules -prune -exec rm -rf {} +", project), undefined)
})

test("does not mistake hyphenated file names for recursive flags", async () => {
  for (const command of [
    "rm pnpm-workspace.yaml",
    "rm -f foo-bar.txt",
    "rm my-file-reader.ts",
    "git checkout -- .gitignore && rm pnpm-workspace.yaml && git status --short",
    "git rm -r --cached node_modules",
  ]) {
    assert.equal(
      await detectDestructiveShellRisk(command, "/tmp/project"),
      undefined,
      command,
    )
  }
})

test("hard-blocks catastrophic targets on later lines and behind a backslash", async () => {
  for (const command of ["cd /\nrm -rf ~", "\\rm -rf /", "nice rm -rf ~", "rm -rf ./dist && rm -rf ~"]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.hardBlock, true, command)
  }
})

test("asks before glob deletion unless it only targets disposable artifacts", async () => {
  for (const command of ["rm -f *", "rm dist/*", "rm -- .*", "rm -f pi/extensions/*.ts", "rm src/*.ts", "rm a.txt && rm -f src/*.ts"]) {
    const risk = await detectDestructiveShellRisk(command, "/tmp/project")
    assert.equal(risk?.category, "Bulk file deletion", command)
  }
  for (const command of ["rm -f *.log", "rm -f logs/*.log", "rm -f **/.DS_Store", "rm -f a.ts b.ts"]) {
    assert.equal(await detectDestructiveShellRisk(command, "/tmp/project"), undefined, command)
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
