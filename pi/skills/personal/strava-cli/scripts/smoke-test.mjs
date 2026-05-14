#!/usr/bin/env node
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const tmp = await mkdtemp(join(tmpdir(), "strava-local-test-"))
let failures = 0

function run(args, expectedStatus = 0) {
  const result = spawnSync("node", ["dist/strava-local.js", ...args], { encoding: "utf8" })
  if (result.status !== expectedStatus) {
    failures++
    console.error(`FAIL ${args.join(" ")} expected ${expectedStatus} got ${result.status}`)
    console.error(result.stdout)
    console.error(result.stderr)
  }
  return result
}

try {
  run(["api", "POST", "/athlete"], 1)
  run(["api", "GET", "https://example.com"], 1)
  run(["route-plan", "scaffold", "--start", "Munich", "--distance-km", "nope", "--out", join(tmp, "bad.json")], 1)

  const activities = join(tmp, "activities.json")
  await writeFile(
    activities,
    JSON.stringify([
      { id: 0, start_date: "2025-12-31T10:00:00Z", sport_type: "Ride", distance: 999, moving_time: 99, total_elevation_gain: 9 },
      { id: 1, start_date: "2026-01-05T10:00:00Z", sport_type: "Ride", distance: 10000, moving_time: 1800, total_elevation_gain: 100 },
      { id: 2, start_date: "2026-01-06T10:00:00Z", sport_type: "TrailRun", distance: 5000, moving_time: 1500, total_elevation_gain: 50 },
    ]),
  )
  run(["training", "summary", "--after", "2026-01-01", "--before", "2026-01-31", "--sport", "cycling", "--from-file", activities, "--out", join(tmp, "summary.json")])
  const exported = join(tmp, "export.json")
  run(["training", "export", "--after", "2026-01-01", "--before", "2026-01-31", "--from-file", activities, "--out", exported])
  run(["training", "weekly", "--after", "2026-01-01", "--before", "2026-01-31", "--from-file", exported, "--out", join(tmp, "weekly.json")])

  const plan = join(tmp, "plan.json")
  await writeFile(
    plan,
    JSON.stringify({
      schema: "strava-local.route-plan.v1",
      name: "Smoke route",
      start: "Munich",
      loop: true,
      target_distance_km: 10,
      bike: "road",
      surface: "paved",
      waypoints: [{ lat: 48.1, lon: 11.5 }],
      trackpoints: [],
    }),
  )
  run(["route-plan", "validate", "--plan", plan, "--out", join(tmp, "valid.json")])
  run(["route-plan", "gpx", "--plan", plan, "--out", join(tmp, "route.gpx")])
} finally {
  await rm(tmp, { recursive: true, force: true })
}

if (failures > 0) process.exit(1)
console.log("smoke tests passed")
