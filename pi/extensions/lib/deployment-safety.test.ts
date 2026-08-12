import assert from "node:assert/strict"
import test from "node:test"

import { inspectProductionDeployment, isProductionVercelDeployment, resolveDeploymentDirectory } from "./deployment-safety.ts"

test("recognizes production Vercel commands and explicit deployment directories", () => {
  assert.equal(isProductionVercelDeployment("vercel --prod"), true)
  assert.equal(isProductionVercelDeployment(["vc", "deploy", "--prod=true"]), true)
  assert.equal(isProductionVercelDeployment("vercel"), false)
  assert.equal(isProductionVercelDeployment("npx vercel --prod"), true)
  assert.equal(isProductionVercelDeployment("pnpm exec vercel --prod"), true)
  assert.equal(resolveDeploymentDirectory("vercel --prod --cwd apps/web", "/repo"), "/repo/apps/web")
  assert.equal(resolveDeploymentDirectory("vercel deploy --prod apps/web", "/repo"), "/repo/apps/web")
})

test("allows a clean production deployment and reports its source state", async () => {
  const calls: string[][] = []
  const result = await inspectProductionDeployment("vercel --prod", { cwd: "/repo", interactive: true }, async (executable, args) => {
    assert.equal(executable, "git")
    calls.push(args)
    if (args[0] === "status") return ""
    if (args[0] === "symbolic-ref") return "main\n"
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return "/repo\n"
    return "abc123\n"
  })
  assert.equal(result.requiresApproval, false)
  assert.deepEqual(result.state, { repositoryRoot: "/repo", deploymentDirectory: "/repo", revision: "abc123", branch: "main", staged: 0, modified: 0, conflicted: 0, untracked: 0 })
  assert.ok(calls.every((args) => !args.join(" ").includes(";")))
})

test("requires approval for staged, modified, conflicted, and untracked files", async () => {
  const result = await inspectProductionDeployment(["vercel", "--prod"], { cwd: "/repo", interactive: true }, async (_executable, args) => {
    if (args[0] === "status") return "M  staged\0 M modified\0UU conflict\0?? new\0"
    if (args[0] === "symbolic-ref") return ""
    if (args[1] === "--show-toplevel") return "/repo\n"
    return "deadbeef\n"
  })
  assert.equal(result.requiresApproval, true)
  assert.equal(result.hardBlock, false)
  assert.deepEqual(result.state && { staged: result.state.staged, modified: result.state.modified, conflicted: result.state.conflicted, untracked: result.state.untracked }, { staged: 1, modified: 1, conflicted: 1, untracked: 1 })
})

test("hard-blocks unknown source state in a noninteractive child", async () => {
  const result = await inspectProductionDeployment("vercel --prod", { cwd: "/repo", interactive: false }, async () => { throw new Error("not a repository") })
  assert.equal(result.requiresApproval, true)
  assert.equal(result.hardBlock, true)
})
