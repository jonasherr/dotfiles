import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { referencedScripts } from "./script-inspection.ts"

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "script-inspection-"))
  return {
    cwd,
    write: async (path: string, content: string) => {
      const fullPath = join(cwd, path)
      await mkdir(join(fullPath, ".."), { recursive: true })
      await writeFile(fullPath, content)
      return fullPath
    },
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  }
}

test("inspects shell interpreter script arguments and skips command/stdin modes", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("cleanup.sh", "rm -rf build\n")
  await files.write("x.sh", "echo x\n")

  for (const command of ["bash cleanup.sh", "sh -e ./x.sh"]) {
    const result = await referencedScripts(command, files.cwd)
    assert.equal(result.scripts.length, 1, command)
    assert.match(result.scripts[0].content, /echo x|rm -rf/)
  }
  for (const command of [
    'bash -c "echo no"',
    'bash -lc "echo no"',
    "bash -s < x.sh",
  ]) {
    const result = await referencedScripts(command, files.cwd)
    assert.deepEqual(result, { scripts: [], uninspectable: [] }, command)
  }
  for (const command of ["bash -o pipefail cleanup.sh", "bash --rcfile rc.sh cleanup.sh"]) {
    assert.equal((await referencedScripts(command, files.cwd)).scripts.length, 1, command)
  }
})

test("inspects source and dot commands relative to caller cwd", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("env.sh", "export VALUE=1\n")

  for (const command of ["source env.sh", ". ./env.sh"]) {
    const result = await referencedScripts(command, files.cwd)
    assert.equal(result.scripts.length, 1, command)
    assert.equal(result.scripts[0].cwd, files.cwd)
  }
})

test("recognizes shell path executables and ignores non-shell files", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("x.sh", "#!/bin/bash\necho shell\n")
  await files.write("scripts/deploy", "#!/usr/bin/env bash\necho deploy\n")
  await files.write("tool", "#!/usr/bin/env node\nconsole.log('no')\n")
  await files.write("binary.sh", "\x00\x01\x02\x03")
  await files.write("unmarked", "echo no shebang\n")

  for (const [command, expected] of [
    ["./x.sh", "shell"],
    ["scripts/deploy", "deploy"],
  ]) {
    const result = await referencedScripts(command, files.cwd)
    assert.equal(result.scripts.length, 1, command)
    assert.match(result.scripts[0].content, new RegExp(expected))
  }
  for (const command of ["./tool", "./binary.sh", "./unmarked", "node x.js", "python x.py"]) {
    assert.deepEqual(await referencedScripts(command, files.cwd), { scripts: [], uninspectable: [] }, command)
  }
})

test("reads package scripts and lifecycle hooks for supported package managers", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write(
    "package.json",
    JSON.stringify({
      scripts: {
        clean: "rm -rf dist",
        preclean: "echo before",
        postclean: "echo after",
        test: "node test.js",
        lint: "eslint .",
        build: "next build",
      },
    }),
  )

  const cases: Array<[string, string[]]> = [
    ["pnpm clean", ["preclean", "clean", "postclean"]],
    ["npm test", ["test"]],
    ["npm run lint --silent", ["lint"]],
    ["npm run-script lint", ["lint"]],
    ["pnpm run build", ["build"]],
    ["pnpm test", ["test"]],
    ["pnpm start", []],
    ["yarn lint", ["lint"]],
    ["yarn run build", ["build"]],
    ["bun run build", ["build"]],
  ]
  for (const [command, expected] of cases) {
    const result = await referencedScripts(command, files.cwd)
    assert.deepEqual(
      result.scripts.map(({ label }) => label.match(/script "([^"]+)"/)?.[1]),
      expected,
      command,
    )
  }
  assert.deepEqual(await referencedScripts("bun run x.ts", files.cwd), { scripts: [], uninspectable: [] })
})

test("skips package manager builtins, workspace flags, and parent package files", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("package.json", JSON.stringify({ scripts: { build: "echo build" } }))
  await mkdir(join(files.cwd, "sub"), { recursive: true })

  for (const command of [
    "pnpm install",
    "pnpm -r build",
    "pnpm --recursive build",
    "npm --workspace app run build",
    "yarn --cwd app build",
    "pnpm add lodash",
    "npm install",
  ]) {
    assert.deepEqual(await referencedScripts(command, files.cwd), { scripts: [], uninspectable: [] }, command)
  }
  assert.deepEqual(await referencedScripts("npm run build", join(files.cwd, "sub")), {
    scripts: [],
    uninspectable: [],
  })
})

test("ignores missing scripts, reports oversized scripts, and caps results", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  const oversizedPath = await files.write("large.sh", "x".repeat(256 * 1024 + 1))
  await files.write("a.sh", "echo a\n")
  await files.write("b.sh", "echo b\n")

  assert.deepEqual(await referencedScripts("bash missing.sh", files.cwd), { scripts: [], uninspectable: [] })
  const large = await referencedScripts("bash large.sh", files.cwd)
  assert.deepEqual(large, { scripts: [], uninspectable: [oversizedPath] })

  const commands = Array.from({ length: 12 }, (_, index) => `bash ${index % 2 ? "a.sh" : "b.sh"}`).join("; ")
  assert.equal((await referencedScripts(commands, files.cwd)).scripts.length, 2)
  for (let index = 0; index < 12; index += 1) {
    await files.write(`script-${index}.sh`, `echo ${index}\n`)
  }
  const capped = await referencedScripts(
    Array.from({ length: 12 }, (_, index) => `source script-${index}.sh`).join("; "),
    files.cwd,
  )
  assert.equal(capped.scripts.length, 10)
})

test("expands tilde paths using the current home directory", async (t) => {
  const cwd = await mkdtemp(join(homedir(), "script-inspection-"))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  await writeFile(join(cwd, "home-script.sh"), "echo home\n")
  const relativeToHome = cwd.slice(homedir().length + 1)
  const result = await referencedScripts(`bash ~/${relativeToHome}/home-script.sh`, "/")
  assert.equal(result.scripts.length, 1)
  assert.match(result.scripts[0].content, /echo home/)
})

test("follows literal cd before resolving a script, and skips unknown directories", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("x.sh", "echo root\n")
  await files.write("sub/x.sh", "echo sub\n")

  const result = await referencedScripts("cd sub && ./x.sh", files.cwd)
  assert.equal(result.scripts.length, 1)
  assert.match(result.scripts[0].content, /echo sub/)
  assert.equal(result.scripts[0].cwd, join(files.cwd, "sub"))
  assert.deepEqual((await referencedScripts('cd "$DIR" && ./x.sh', files.cwd)).scripts, [])
})

test("resolves package directory flags", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("sub/package.json", JSON.stringify({ scripts: { wipe: "rm -rf src" } }))
  for (const command of ["pnpm --dir sub run wipe", "npm --prefix sub run wipe", "yarn --cwd=sub wipe", "npm --silent --prefix sub run wipe"]) {
    const result = await referencedScripts(command, files.cwd)
    assert.equal(result.scripts[0]?.content, "rm -rf src", command)
    assert.equal(result.scripts[0]?.cwd, join(files.cwd, "sub"), command)
  }
  assert.deepEqual((await referencedScripts("pnpm --filter sub wipe", files.cwd)).scripts, [])
})

test("returns no references when shell parsing is not confident", async (t) => {
  const files = await fixture()
  t.after(files.cleanup)
  await files.write("x.sh", "echo x\n")
  assert.deepEqual(await referencedScripts('bash "x.sh', files.cwd), { scripts: [], uninspectable: [] })
})
