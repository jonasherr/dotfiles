import assert from "node:assert/strict"
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"

import {
  createTemporaryWorkspaceCreateParameters,
  createTemporaryWorkspaceDeleteParameters,
  createTemporaryWorkspaceHandler,
  createTemporaryWorkspaceListParameters,
  ManagedTemporaryWorkspaces,
  temporaryWorkspaceConstants,
  type TemporaryWorkspaceDependencies,
} from "./temporary-workspace.ts"

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "temporary-workspace-test-"))
  const temp = join(root, "tmp")
  const home = join(root, "home")
  const cwd = join(root, "cwd")
  await Promise.all([mkdir(temp), mkdir(home), mkdir(cwd)])
  t.after(() => rm(root, { recursive: true, force: true }))

  const removeCalls: Array<{ executable: string; args: string[] }> = []
  const dependencies: Partial<TemporaryWorkspaceDependencies> = {
    tmpdir: () => temp,
    homedir: () => home,
    remove: async (executable, args) => {
      removeCalls.push({ executable, args })
      await rm(args.at(-1)!, { recursive: true, force: true })
    },
  }
  return { root, temp, home, cwd, dependencies, removeCalls }
}

test("create, list, and delete use an opaque ID and fixed non-shell rm invocation", async (t) => {
  const { cwd, dependencies, removeCalls } = await fixture(t)
  const manager = new ManagedTemporaryWorkspaces(dependencies)

  const workspace = await manager.create()
  assert.match(
    workspace.path,
    new RegExp(`/${temporaryWorkspaceConstants.workspacePrefix}[^/]+$`),
  )
  assert.ok(
    !workspace.path.includes(workspace.id),
    "ID must be independent of the generated path",
  )
  assert.deepEqual(await manager.list(cwd), [workspace])

  assert.deepEqual(await manager.delete(workspace.id, cwd), workspace)
  assert.equal(removeCalls.length, 1)
  assert.equal(removeCalls[0].executable, "/bin/rm")
  assert.deepEqual(removeCalls[0].args.slice(0, 2), ["-rfx", "--"])
  assert.match(
    removeCalls[0].args[2],
    new RegExp(`/${temporaryWorkspaceConstants.quarantinePrefix}[^/]+$`),
  )
  assert.deepEqual(await manager.list(cwd), [])
})

test("rejects a managed root that is not mode 0700", async (t) => {
  const { temp, dependencies } = await fixture(t)
  const managedRoot = join(temp, temporaryWorkspaceConstants.managedRootName)
  await mkdir(managedRoot, { mode: 0o755 })
  await chmod(managedRoot, 0o755)
  const manager = new ManagedTemporaryWorkspaces(dependencies)

  await assert.rejects(
    manager.create(),
    /managed temporary workspace root must be an owned mode-0700 real directory/,
  )
})

test("unknown, random, and repeated IDs cannot delete workspaces", async (t) => {
  const { cwd, dependencies } = await fixture(t)
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()

  await assert.rejects(
    manager.delete("random-unknown-id", cwd),
    /unknown temporary workspace ID/,
  )
  await manager.delete(workspace.id, cwd)
  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /unknown temporary workspace ID/,
  )
})

test("separate manager instances have process-local ownership registries", async (t) => {
  const { cwd, dependencies } = await fixture(t)
  const owner = new ManagedTemporaryWorkspaces(dependencies)
  const other = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await owner.create()

  assert.deepEqual(await other.list(cwd), [])
  await assert.rejects(
    other.delete(workspace.id, cwd),
    /unknown temporary workspace ID/,
  )
  assert.deepEqual(await owner.list(cwd), [workspace])
  await owner.delete(workspace.id, cwd)
})

test("rejects symlink replacement without invoking rm", async (t) => {
  const { root, cwd, dependencies, removeCalls } = await fixture(t)
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()
  const original = `${workspace.path}-original`
  const outside = join(root, "outside")
  await mkdir(outside)
  await rename(workspace.path, original)
  await symlink(outside, workspace.path)

  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /identity or path validation failed/,
  )
  assert.deepEqual(removeCalls, [])
  assert.deepEqual(await manager.list(cwd), [])
})

test("rejects directory identity replacement without invoking rm", async (t) => {
  const { cwd, dependencies, removeCalls } = await fixture(t)
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()
  await rename(workspace.path, `${workspace.path}-original`)
  await mkdir(workspace.path)

  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /identity or path validation failed/,
  )
  assert.deepEqual(removeCalls, [])
  assert.deepEqual(await manager.list(cwd), [])
})

test("a workspace containing cwd or home is neither listed nor renamed", async (t) => {
  const cases = [
    { protectedLocation: "cwd", relation: "equal" },
    { protectedLocation: "cwd", relation: "descendant" },
    { protectedLocation: "home", relation: "equal" },
    { protectedLocation: "home", relation: "descendant" },
  ] as const

  for (const testCase of cases) {
    await t.test(
      `${testCase.protectedLocation} ${testCase.relation}`,
      async (t) => {
        const fixtureData = await fixture(t)
        const { cwd, dependencies, removeCalls } = fixtureData
        let home = fixtureData.home
        let renameCalls = 0
        dependencies.homedir = () => home
        dependencies.rename = async (source, destination) => {
          renameCalls += 1
          await rename(source, destination)
        }
        const manager = new ManagedTemporaryWorkspaces(dependencies)
        const workspace = await manager.create()
        const protectedPath =
          testCase.relation === "equal"
            ? workspace.path
            : join(workspace.path, "protected")
        if (testCase.relation === "descendant") await mkdir(protectedPath)
        const deleteCwd =
          testCase.protectedLocation === "cwd" ? protectedPath : cwd
        if (testCase.protectedLocation === "home") home = protectedPath

        assert.deepEqual(await manager.list(deleteCwd), [])
        await assert.rejects(
          manager.delete(workspace.id, deleteCwd),
          /identity or path validation failed/,
        )
        assert.equal(renameCalls, 0)
        assert.deepEqual(removeCalls, [])
        assert.ok((await lstat(workspace.path)).isDirectory())
      },
    )
  }
})

test("retains the quarantined capability after deletion failure for retry", async (t) => {
  const { cwd, dependencies } = await fixture(t)
  let attempts = 0
  dependencies.remove = async (_executable, args) => {
    attempts += 1
    if (attempts === 1) throw new Error("simulated rm failure")
    await rm(args.at(-1)!, { recursive: true, force: true })
  }
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()

  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /simulated rm failure/,
  )
  const [quarantined] = await manager.list(cwd)
  assert.equal(quarantined.id, workspace.id)
  assert.match(
    quarantined.path,
    new RegExp(`/${temporaryWorkspaceConstants.quarantinePrefix}[^/]+$`),
  )
  await manager.delete(workspace.id, cwd)
  assert.equal(attempts, 2)
  assert.deepEqual(await manager.list(cwd), [])
})

test("serializes concurrent deletion of the same ID", async (t) => {
  const { cwd, dependencies, removeCalls } = await fixture(t)
  let releaseRemove!: () => void
  let markRemoveStarted!: () => void
  const removeGate = new Promise<void>((resolve) => {
    releaseRemove = resolve
  })
  const removeStarted = new Promise<void>((resolve) => {
    markRemoveStarted = resolve
  })
  dependencies.remove = async (executable, args) => {
    removeCalls.push({ executable, args })
    markRemoveStarted()
    await removeGate
    await rm(args.at(-1)!, { recursive: true, force: true })
  }
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()

  const first = manager.delete(workspace.id, cwd)
  const second = manager.delete(workspace.id, cwd)
  await removeStarted
  assert.equal(removeCalls.length, 1)
  releaseRemove()

  assert.deepEqual(await first, workspace)
  await assert.rejects(second, /unknown temporary workspace ID/)
  assert.equal(removeCalls.length, 1)
})

test("a source swap in the injected rename hook fails closed", async (t) => {
  const { root, cwd, dependencies, removeCalls } = await fixture(t)
  const outside = join(root, "outside")
  const replacement = join(root, "replacement")
  await Promise.all([mkdir(outside), mkdir(replacement)])
  dependencies.rename = async (source, destination) => {
    await rename(source, `${source}-owned`)
    await rename(replacement, source)
    await rename(source, destination)
  }
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()

  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /identity or path validation failed/,
  )
  assert.deepEqual(removeCalls, [])
  assert.ok(
    removeCalls.every(
      (call) =>
        !call.args.includes(outside) && !call.args.includes(replacement),
    ),
  )
})

test("a post-rename swap in the injected rename hook fails closed", async (t) => {
  const { root, cwd, dependencies, removeCalls } = await fixture(t)
  const outside = join(root, "outside")
  const replacement = join(root, "replacement")
  await Promise.all([mkdir(outside), mkdir(replacement)])
  dependencies.rename = async (source, destination) => {
    await rename(source, destination)
    await rename(destination, `${destination}-owned`)
    await rename(replacement, destination)
  }
  const manager = new ManagedTemporaryWorkspaces(dependencies)
  const workspace = await manager.create()

  await assert.rejects(
    manager.delete(workspace.id, cwd),
    /identity or path validation failed/,
  )
  assert.deepEqual(removeCalls, [])
  assert.ok(
    removeCalls.every(
      (call) =>
        !call.args.includes(outside) && !call.args.includes(replacement),
    ),
  )
})

async function executeTool(params: Record<string, unknown>) {
  const execute = createTemporaryWorkspaceHandler()
  return execute(
    params as { action: "create" | "list" | "delete"; id?: string },
    new AbortController().signal,
    process.cwd(),
  )
}

test("registered tool execute throws for invalid internal actions and IDs", async () => {
  await assert.rejects(
    executeTool({ action: "delete", id: "unknown" }),
    /temporary_workspace failed: unknown temporary workspace ID/,
  )
  await assert.rejects(
    executeTool({ action: "delete" }),
    /temporary_workspace failed: delete requires a non-empty workspace ID/,
  )
  await assert.rejects(
    executeTool({ action: "delete", id: "" }),
    /temporary_workspace failed: delete requires a non-empty workspace ID/,
  )
  await assert.rejects(
    executeTool({ action: "other" }),
    /temporary_workspace failed: unsupported action: other/,
  )
})

test("split tools expose closed, action-specific schemas", async () => {
  const Type = {
    String: (options = {}) => ({ type: "string", ...options }),
    Object: (properties, options = {}) => ({
      type: "object",
      properties,
      required: Object.keys(properties),
      ...options,
    }),
  }
  const createSchema = createTemporaryWorkspaceCreateParameters(Type) as any
  const listSchema = createTemporaryWorkspaceListParameters(Type) as any
  const deleteSchema = createTemporaryWorkspaceDeleteParameters(Type) as any

  for (const schema of [createSchema, listSchema, deleteSchema]) {
    assert.equal(schema.type, "object")
    assert.equal(schema.additionalProperties, false)
    assert.equal("anyOf" in schema, false)
    assert.equal("oneOf" in schema, false)
  }
  assert.deepEqual(createSchema.properties, {})
  assert.deepEqual(createSchema.required, [])
  assert.deepEqual(listSchema.properties, {})
  assert.deepEqual(listSchema.required, [])
  assert.deepEqual(deleteSchema.required, ["id"])
  assert.deepEqual(Object.keys(deleteSchema.properties), ["id"])
  assert.equal(deleteSchema.properties.id.type, "string")
  assert.equal(deleteSchema.properties.id.minLength, 1)
  assert.match(deleteSchema.properties.id.description, /temporary_workspace_create/)

  const source = await readFile(
    new URL("../temporary-workspace.ts", import.meta.url),
    "utf8",
  )
  for (const name of [
    "temporary_workspace_create",
    "temporary_workspace_list",
    "temporary_workspace_delete",
  ]) {
    assert.match(source, new RegExp(`name: "${name}"`))
  }
  assert.doesNotMatch(source, /name: "temporary_workspace"/)
  assert.doesNotMatch(source, /\bpath:\s*Type\./)
  assert.doesNotMatch(source, /Type\.Union/)
  assert.match(source, /Prefer pipes or stdout/)
})
