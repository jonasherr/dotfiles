#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { apiRequest, assertReadOnlyApiMethod } from "./client.js"
import { parseBool, printHuman, writeOutput } from "./io.js"
import type { CliOptions, JsonValue } from "./types.js"

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
  options: CliOptions
}

function usage(): string {
  return `strava-local: conservative local Strava CLI

Setup:
  export STRAVA_CLIENT_ID="$(op read 'op://Personal/Strava API/client_id')"
  export STRAVA_CLIENT_SECRET="$(op read 'op://Personal/Strava API/client_secret')"
  export STRAVA_REFRESH_TOKEN="$(op read 'op://Personal/Strava API/refresh_token')"

Commands:
  strava-local whoami [--json] [--out file]
  strava-local api GET /athlete [--json] [--out file]
  strava-local activities list [--after YYYY-MM-DD] [--before YYYY-MM-DD] [--per-page 100] [--out file]
  strava-local activities get <activity-id> [--out file]
  strava-local activities streams <activity-id> [--keys time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp] [--out file]
  strava-local activities zones <activity-id> [--out file]
  strava-local athlete stats [--athlete-id me] [--out file]
  strava-local routes list [--athlete-id me] [--out file]
  strava-local routes get <route-id> [--out file]
  strava-local routes export <route-id> --format gpx|tcx [--out file]
  strava-local routes create --name NAME --gpx route.gpx --confirm-create [--private true] [--out file]
  strava-local route-plan scaffold --start PLACE --distance-km 80 --bike road --surface paved --elevation max-1200 --out plan.json
  strava-local route-plan gpx --plan plan.json --out route.gpx

Safety:
  DELETE, PUT, PATCH, activity edits, route deletes, and profile changes are blocked.`
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith("--")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      positional.push(arg)
    }
  }

  return {
    positional,
    flags,
    options: { out: stringFlag(flags, "out"), json: Boolean(flags.json) },
  }
}

function stringFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name]
  return typeof value === "string" ? value : undefined
}

function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = stringFlag(flags, name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function epochSeconds(date: string | undefined): number | undefined {
  if (!date) return undefined
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${date}`)
  return Math.floor(ms / 1000)
}

async function athleteId(flags: Record<string, string | boolean>): Promise<string> {
  const requested = stringFlag(flags, "athlete-id") ?? "me"
  if (requested !== "me") return requested
  const athlete = await apiRequest<{ id: number }>("GET", "/athlete")
  return String(athlete.id)
}

async function saveAudit(path: string, payload: JsonValue): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

function routePlanToGpx(plan: Record<string, JsonValue>): string {
  const name = String(plan.name ?? `Route from ${plan.start ?? "unknown start"}`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="strava-local" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${escapeXml(name)}</name></metadata>\n  <rte>\n    <name>${escapeXml(name)}</name>\n  </rte>\n</gpx>\n`
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

async function run(parsed: ParsedArgs): Promise<void> {
  const [domain, action, idOrMethod, maybePath] = parsed.positional
  const { flags, options } = parsed

  if (!domain || domain === "help" || flags.help) {
    console.log(usage())
    return
  }

  if (domain === "whoami") {
    const data = await apiRequest("GET", "/athlete")
    await writeOutput(data, options)
    return
  }

  if (domain === "api") {
    const method = assertReadOnlyApiMethod(action ?? "")
    if (!idOrMethod) throw new Error("Missing API path")
    const data = await apiRequest(method, idOrMethod)
    await writeOutput(data, options)
    return
  }

  if (domain === "activities") {
    if (action === "list") {
      const data = await apiRequest("GET", "/athlete/activities", {
        after: epochSeconds(stringFlag(flags, "after")),
        before: epochSeconds(stringFlag(flags, "before")),
        per_page: stringFlag(flags, "per-page") ?? "30",
      })
      await writeOutput(data, options)
      return
    }
    if (!idOrMethod) throw new Error(`Missing activity id for activities ${action}`)
    const path = action === "get" ? `/activities/${idOrMethod}` : `/activities/${idOrMethod}/${action}`
    const query = action === "streams" ? { keys: stringFlag(flags, "keys"), key_by_type: true } : {}
    const data = await apiRequest("GET", path, query)
    await writeOutput(data, options)
    return
  }

  if (domain === "athlete" && action === "stats") {
    const id = await athleteId(flags)
    const data = await apiRequest("GET", `/athletes/${id}/stats`)
    await writeOutput(data, options)
    return
  }

  if (domain === "routes") {
    if (action === "list") {
      const id = await athleteId(flags)
      const data = await apiRequest("GET", `/athletes/${id}/routes`, { per_page: stringFlag(flags, "per-page") ?? "100" })
      await writeOutput(data, options)
      return
    }
    if (action === "create") {
      if (!flags["confirm-create"]) throw new Error("Route creation requires --confirm-create")
      const payload = {
        name: requireFlag(flags, "name"),
        description: stringFlag(flags, "description") ?? "Created by strava-local",
        private: parseBool(stringFlag(flags, "private"), true),
        gpx: requireFlag(flags, "gpx"),
        note: "Strava's public route creation support may be unavailable. If API creation fails, manually upload the GPX file.",
      }
      await saveAudit(`${process.cwd()}/strava-route-create-payload.json`, payload)
      printHuman(`Creating route '${payload.name}' from ${payload.gpx}. Audit saved to strava-route-create-payload.json`, options)
      const data = await apiRequest("POST", "/routes", {}, payload)
      await writeOutput(data, options)
      return
    }
    if (!idOrMethod) throw new Error(`Missing route id for routes ${action}`)
    if (action === "get") {
      await writeOutput(await apiRequest("GET", `/routes/${idOrMethod}`), options)
      return
    }
    if (action === "export") {
      const format = requireFlag(flags, "format")
      if (!["gpx", "tcx"].includes(format)) throw new Error("--format must be gpx or tcx")
      await writeOutput(await apiRequest<string>("GET", `/routes/${idOrMethod}/export_${format}`), options)
      return
    }
  }

  if (domain === "route-plan") {
    if (action === "scaffold") {
      const plan = {
        name: stringFlag(flags, "name") ?? `Route from ${requireFlag(flags, "start")}`,
        start: requireFlag(flags, "start"),
        distance_km: Number(requireFlag(flags, "distance-km")),
        bike: stringFlag(flags, "bike") ?? "road",
        surface: stringFlag(flags, "surface") ?? "paved",
        elevation: stringFlag(flags, "elevation") ?? null,
        routing_backend: null,
        waypoints: [],
        notes: "Fill waypoints or use an external routing backend, then generate or import GPX.",
      }
      await writeOutput(plan, options)
      return
    }
    if (action === "gpx") {
      const planPath = requireFlag(flags, "plan")
      const plan = JSON.parse(await (await import("node:fs/promises")).readFile(planPath, "utf8"))
      await writeOutput(routePlanToGpx(plan), options)
      return
    }
  }

  throw new Error(`Unknown command: ${parsed.positional.join(" ")}`)
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    await run(parseArgs(argv))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}
