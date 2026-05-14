#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { apiRequest, apiRequestWithMeta, assertReadOnlyApiMethod } from "./client.js"
import { writeOutput } from "./io.js"
import type { CliOptions, JsonValue } from "./types.js"

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
  options: CliOptions
}

type Activity = Record<string, JsonValue>
type Point = { lat: number; lon: number; name?: string }

const ACTIVITY_COMMANDS = new Set(["list", "get", "streams", "zones"])
const ROUTE_COMMANDS = new Set(["list", "get", "export", "prepare-upload"])
const ROUTE_PLAN_COMMANDS = new Set(["scaffold", "gpx"])
const TRAINING_COMMANDS = new Set(["export", "weekly", "summary"])
const DEFAULT_STREAM_KEYS = "time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp"
const MAX_PER_PAGE = 200
const DEFAULT_MAX_PAGES = 10

function usage(): string {
  return `strava-local: conservative local Strava CLI

Commands:
  strava-local whoami [--json] [--out file]
  strava-local api GET /athlete [--json] [--out file]
  strava-local activities list [--after YYYY-MM-DD] [--before YYYY-MM-DD] [--per-page 100] [--page 1] [--all] [--max-pages 10] [--out file]
  strava-local activities get <activity-id> [--out file]
  strava-local activities streams <activity-id> [--keys ${DEFAULT_STREAM_KEYS}] [--out file]
  strava-local activities zones <activity-id> [--out file]
  strava-local athlete stats [--athlete-id me] [--out file]
  strava-local routes list [--athlete-id me] [--per-page 100] [--page 1] [--all] [--max-pages 10] [--out file]
  strava-local routes get <route-id> [--out file]
  strava-local routes export <route-id> --format gpx|tcx [--out file]
  strava-local routes prepare-upload --gpx route.gpx --name NAME [--out upload-instructions.json]
  strava-local training export --after YYYY-MM-DD --before YYYY-MM-DD [--sport Ride,Run] [--out activities-normalized.json]
  strava-local training weekly --after YYYY-MM-DD --before YYYY-MM-DD [--sport Ride,Run] [--out weekly.json]
  strava-local training summary --after YYYY-MM-DD --before YYYY-MM-DD [--sport Ride,Run] [--out summary.json]
  strava-local route-plan scaffold --start PLACE --distance-km 80 [--finish PLACE|--loop true] --out plan.json
  strava-local route-plan gpx --plan plan.json --out route.gpx

Safety:
  Absolute API URLs, POST, DELETE, PUT, PATCH, activity edits, route deletes, and profile changes are blocked.`
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (!next || next.startsWith("--")) flags[key] = true
      else {
        flags[key] = next
        i++
      }
    } else positional.push(arg)
  }
  return { positional, flags, options: { out: stringFlag(flags, "out"), json: Boolean(flags.json) } }
}

function stringFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name]
  return typeof value === "string" ? value : undefined
}

function boolFlag(flags: Record<string, string | boolean>, name: string, fallback = false): boolean {
  const value = flags[name]
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value
  return ["1", "true", "yes", "y"].includes(value.toLowerCase())
}

function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = stringFlag(flags, name)
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function intFlag(flags: Record<string, string | boolean>, name: string, fallback: number): number {
  const raw = stringFlag(flags, name)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`)
  return value
}

function positiveNumberFlag(flags: Record<string, string | boolean>, name: string): number {
  const raw = requireFlag(flags, name)
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`)
  return value
}

function perPage(flags: Record<string, string | boolean>): number {
  return Math.min(intFlag(flags, "per-page", 30), MAX_PER_PAGE)
}

function epochSeconds(date: string | undefined, endOfDay = false): number | undefined {
  if (!date) return undefined
  const ms = Date.parse(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`)
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${date}`)
  return Math.floor(ms / 1000)
}

async function athleteId(flags: Record<string, string | boolean>): Promise<string> {
  const requested = stringFlag(flags, "athlete-id") ?? "me"
  if (requested !== "me") return requested
  const athlete = await apiRequest<{ id: number }>("GET", "/athlete")
  return String(athlete.id)
}

function assertKnown(action: string | undefined, allowed: Set<string>, domain: string): string {
  if (!action || !allowed.has(action)) {
    throw new Error(`Unknown ${domain} command: ${action ?? ""}. Allowed: ${Array.from(allowed).join(", ")}`)
  }
  return action
}

async function pagedGet<T extends JsonValue[]>(
  path: string,
  flags: Record<string, string | boolean>,
  baseQuery: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const pageSize = perPage(flags)
  if (!flags.all) {
    const result = await apiRequestWithMeta<T>("GET", path, { ...baseQuery, per_page: pageSize, page: intFlag(flags, "page", 1) })
    printRateLimit(result.rateLimit, result.rateLimitUsage)
    return result.data
  }

  const maxPages = intFlag(flags, "max-pages", DEFAULT_MAX_PAGES)
  const rows: JsonValue[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await apiRequestWithMeta<T>("GET", path, { ...baseQuery, per_page: pageSize, page })
    printRateLimit(result.rateLimit, result.rateLimitUsage)
    rows.push(...result.data)
    if (result.data.length < pageSize) break
  }
  return rows as T
}

function printRateLimit(limit?: string, usage?: string): void {
  if (limit || usage) console.error(`Strava rate limit: usage=${usage ?? "unknown"} limit=${limit ?? "unknown"}`)
}

async function loadActivities(flags: Record<string, string | boolean>): Promise<Activity[]> {
  const activities = await pagedGet<Activity[]>("/athlete/activities", { ...flags, all: flags.all ?? true }, {
    after: epochSeconds(requireFlag(flags, "after")),
    before: epochSeconds(requireFlag(flags, "before"), true),
  })
  const sports = (stringFlag(flags, "sport") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (sports.length === 0) return activities
  return activities.filter((activity) => sports.includes(String(activity.sport_type ?? activity.type ?? "")))
}

function normalizedActivity(activity: Activity): Record<string, JsonValue> {
  return {
    id: activity.id ?? null,
    name: activity.name ?? null,
    start_date: activity.start_date ?? activity.start_date_local ?? null,
    sport_type: activity.sport_type ?? activity.type ?? null,
    distance_m: numberValue(activity.distance),
    moving_time_s: numberValue(activity.moving_time),
    elapsed_time_s: numberValue(activity.elapsed_time),
    elevation_gain_m: numberValue(activity.total_elevation_gain),
    average_speed_mps: numberValue(activity.average_speed),
    max_speed_mps: numberValue(activity.max_speed),
    average_heartrate: numberValue(activity.average_heartrate),
    max_heartrate: numberValue(activity.max_heartrate),
    average_watts: numberValue(activity.average_watts),
    weighted_average_watts: numberValue(activity.weighted_average_watts),
    average_cadence: numberValue(activity.average_cadence),
    trainer: Boolean(activity.trainer),
    commute: Boolean(activity.commute),
  }
}

function metadata(flags: Record<string, string | boolean>): Record<string, JsonValue> {
  return {
    generated_at: new Date().toISOString(),
    date_range: { after: requireFlag(flags, "after"), before: requireFlag(flags, "before") },
    source: { cli: "strava-local", api: "Strava v3", normalized: true },
  }
}

function weekKey(date: string): string {
  const d = new Date(date)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function trainingWeekly(activities: Activity[], flags: Record<string, string | boolean>): Record<string, JsonValue> {
  const weeks = new Map<string, { items: Activity[]; distance: number; moving: number; elapsed: number; elevation: number }>()
  for (const activity of activities) {
    const key = weekKey(String(activity.start_date ?? activity.start_date_local))
    const week = weeks.get(key) ?? { items: [], distance: 0, moving: 0, elapsed: 0, elevation: 0 }
    week.items.push(activity)
    week.distance += numberValue(activity.distance)
    week.moving += numberValue(activity.moving_time)
    week.elapsed += numberValue(activity.elapsed_time)
    week.elevation += numberValue(activity.total_elevation_gain)
    weeks.set(key, week)
  }
  return {
    ...metadata(flags),
    weeks: Array.from(weeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, week]) => {
        const long = [...week.items].sort((a, b) => numberValue(b.distance) - numberValue(a.distance))[0]
        return {
          week_start,
          activity_count: week.items.length,
          distance_m: round(week.distance),
          moving_time_s: round(week.moving),
          elapsed_time_s: round(week.elapsed),
          elevation_gain_m: round(week.elevation),
          long_activity: long ? normalizedActivity(long) : null,
          average_heartrate: average(week.items.map((a) => numberValue(a.average_heartrate)).filter(Boolean)),
          average_watts: average(week.items.map((a) => numberValue(a.average_watts)).filter(Boolean)),
          average_cadence: average(week.items.map((a) => numberValue(a.average_cadence)).filter(Boolean)),
        }
      }),
  }
}

function trainingSummary(activities: Activity[], flags: Record<string, string | boolean>): Record<string, JsonValue> {
  const weekly = trainingWeekly(activities, flags).weeks as JsonValue[]
  const activeDays = new Set(activities.map((a) => String(a.start_date_local ?? a.start_date ?? "").slice(0, 10)).filter(Boolean))
  const longest = [...activities].sort((a, b) => numberValue(b.distance) - numberValue(a.distance))[0]
  const sportCounts = countBy(activities.map((a) => String(a.sport_type ?? a.type ?? "Unknown")))
  return {
    ...metadata(flags),
    totals: {
      activity_count: activities.length,
      active_days: activeDays.size,
      rest_days_estimate: daysBetween(requireFlag(flags, "after"), requireFlag(flags, "before")) - activeDays.size,
      distance_m: round(sum(activities, "distance")),
      moving_time_s: round(sum(activities, "moving_time")),
      elevation_gain_m: round(sum(activities, "total_elevation_gain")),
      sport_counts: sportCounts,
    },
    consistency: {
      weeks_with_activity: weekly.length,
      average_activities_per_week: round(activities.length / Math.max(weekly.length, 1)),
    },
    longest_activity: longest ? normalizedActivity(longest) : null,
    weekly_progression: weekly,
    data_availability: {
      heart_rate_activities: activities.filter((a) => numberValue(a.average_heartrate) > 0).length,
      power_activities: activities.filter((a) => numberValue(a.average_watts) > 0 || numberValue(a.weighted_average_watts) > 0).length,
      cadence_activities: activities.filter((a) => numberValue(a.average_cadence) > 0).length,
    },
    caveats: ["Summary uses Strava activity summaries only unless streams were fetched separately.", "Missing sensors are reported as unavailable, not estimated."],
  }
}

function routePlanToGpx(plan: Record<string, JsonValue>): string {
  const name = String(plan.name ?? `Route from ${plan.start ?? "unknown start"}`)
  const waypoints = pointArray(plan.waypoints)
  const trackpoints = pointArray(plan.trackpoints)
  if (waypoints.length === 0 && trackpoints.length === 0) throw new Error("Route plan has no waypoints or trackpoints. Add geometry before generating GPX.")
  const rte = waypoints.length
    ? `  <rte>\n    <name>${escapeXml(name)}</name>\n${waypoints.map((p) => `    <rtept lat="${p.lat}" lon="${p.lon}">${p.name ? `<name>${escapeXml(p.name)}</name>` : ""}</rtept>`).join("\n")}\n  </rte>\n`
    : ""
  const trk = trackpoints.length
    ? `  <trk>\n    <name>${escapeXml(name)}</name>\n    <trkseg>\n${trackpoints.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}">${p.name ? `<name>${escapeXml(p.name)}</name>` : ""}</trkpt>`).join("\n")}\n    </trkseg>\n  </trk>\n`
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="strava-local" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${escapeXml(name)}</name></metadata>\n${rte}${trk}</gpx>\n`
}

function pointArray(value: JsonValue | undefined): Point[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Route geometry points must be objects")
    const lat = Number(entry.lat)
    const lon = Number(entry.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Route geometry points require numeric lat and lon")
    return { lat, lon, name: typeof entry.name === "string" ? entry.name : undefined }
  })
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round(values.reduce((total, value) => total + value, 0) / values.length)
}

function sum(activities: Activity[], field: string): number {
  return activities.reduce((total, activity) => total + numberValue(activity[field]), 0)
}

function countBy(values: string[]): Record<string, JsonValue> {
  return values.reduce<Record<string, JsonValue>>((counts, value) => {
    counts[value] = numberValue(counts[value]) + 1
    return counts
  }, {})
}

function daysBetween(after: string, before: string): number {
  return Math.max(0, Math.ceil((Date.parse(`${before}T00:00:00Z`) - Date.parse(`${after}T00:00:00Z`)) / 86_400_000) + 1)
}

async function run(parsed: ParsedArgs): Promise<void> {
  const [domain, action, idOrMethod] = parsed.positional
  const { flags, options } = parsed

  if (!domain || domain === "help" || flags.help) {
    console.log(usage())
    return
  }

  if (domain === "whoami") return writeOutput(await apiRequest("GET", "/athlete"), options)

  if (domain === "api") {
    const method = assertReadOnlyApiMethod(action ?? "")
    if (!idOrMethod) throw new Error("Missing API path")
    return writeOutput(await apiRequest(method, idOrMethod), options)
  }

  if (domain === "activities") {
    const command = assertKnown(action, ACTIVITY_COMMANDS, "activities")
    if (command === "list") {
      return writeOutput(
        await pagedGet<Activity[]>("/athlete/activities", flags, {
          after: epochSeconds(stringFlag(flags, "after")),
          before: epochSeconds(stringFlag(flags, "before"), true),
        }),
        options,
      )
    }
    if (!idOrMethod) throw new Error(`Missing activity id for activities ${command}`)
    if (command === "get") return writeOutput(await apiRequest("GET", `/activities/${idOrMethod}`), options)
    if (command === "streams") {
      return writeOutput(await apiRequest("GET", `/activities/${idOrMethod}/streams`, { keys: stringFlag(flags, "keys") ?? DEFAULT_STREAM_KEYS, key_by_type: true }), options)
    }
    return writeOutput(await apiRequest("GET", `/activities/${idOrMethod}/zones`), options)
  }

  if (domain === "athlete" && action === "stats") {
    return writeOutput(await apiRequest("GET", `/athletes/${await athleteId(flags)}/stats`), options)
  }

  if (domain === "routes") {
    const command = assertKnown(action, ROUTE_COMMANDS, "routes")
    if (command === "list") return writeOutput(await pagedGet<JsonValue[]>(`/athletes/${await athleteId(flags)}/routes`, flags), options)
    if (command === "prepare-upload") {
      const gpx = requireFlag(flags, "gpx")
      await readFile(gpx, "utf8")
      return writeOutput(
        {
          generated_at: new Date().toISOString(),
          name: requireFlag(flags, "name"),
          gpx,
          upload_url: "https://www.strava.com/routes/new",
          instructions: ["Open Strava route builder.", "Import or upload the GPX file manually.", "Review privacy and route details before saving."],
          note: "strava-local does not POST /routes because public Strava route creation support is not confirmed.",
        },
        options,
      )
    }
    if (!idOrMethod) throw new Error(`Missing route id for routes ${command}`)
    if (command === "get") return writeOutput(await apiRequest("GET", `/routes/${idOrMethod}`), options)
    const format = requireFlag(flags, "format")
    if (!["gpx", "tcx"].includes(format)) throw new Error("--format must be gpx or tcx")
    return writeOutput(await apiRequest<string>("GET", `/routes/${idOrMethod}/export_${format}`), options)
  }

  if (domain === "training") {
    const command = assertKnown(action, TRAINING_COMMANDS, "training")
    const activities = await loadActivities(flags)
    if (command === "export") return writeOutput({ ...metadata(flags), activities: activities.map(normalizedActivity) }, options)
    if (command === "weekly") return writeOutput(trainingWeekly(activities, flags), options)
    return writeOutput(trainingSummary(activities, flags), options)
  }

  if (domain === "route-plan") {
    const command = assertKnown(action, ROUTE_PLAN_COMMANDS, "route-plan")
    if (command === "scaffold") {
      const plan = {
        schema: "strava-local.route-plan.v1",
        name: stringFlag(flags, "name") ?? `Route from ${requireFlag(flags, "start")}`,
        start: requireFlag(flags, "start"),
        finish: stringFlag(flags, "finish") ?? null,
        loop: boolFlag(flags, "loop", !stringFlag(flags, "finish")),
        target_distance_km: positiveNumberFlag(flags, "distance-km"),
        bike: stringFlag(flags, "bike") ?? "road",
        surface: stringFlag(flags, "surface") ?? "paved",
        elevation_preference: stringFlag(flags, "elevation") ?? null,
        waypoints: [],
        trackpoints: [],
        notes: "Add waypoints or trackpoints before generating GPX. Use { lat, lon, name? } points.",
      }
      return writeOutput(plan, options)
    }
    const plan = JSON.parse(await readFile(requireFlag(flags, "plan"), "utf8")) as Record<string, JsonValue>
    return writeOutput(routePlanToGpx(plan), options)
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
