#!/usr/bin/env node
import { access, mkdtemp, rm } from "node:fs/promises"
import { constants } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const tmp = await mkdtemp(join(tmpdir(), "strava-local-dist-check-"))
try {
  const build = spawnSync(
    "npx",
    ["tsc", "-p", "tsconfig.json", "--outDir", tmp, "--tsBuildInfoFile", join(tmp, "tsconfig.tsbuildinfo")],
    { stdio: "inherit" },
  )
  if (build.status !== 0) process.exit(build.status ?? 1)

  try {
    await access("dist", constants.R_OK)
  } catch {
    console.error("dist/ is missing. Run pnpm build.")
    process.exit(1)
  }

  const diff = spawnSync("diff", ["-qr", "dist", tmp], { encoding: "utf8" })
  if (diff.status !== 0) {
    console.error("dist/ is not current with src/. Run pnpm build.")
    if (diff.stdout) console.error(diff.stdout.trim())
    process.exit(diff.status ?? 1)
  }
} finally {
  await rm(tmp, { recursive: true, force: true })
}
