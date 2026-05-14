---
name: strava-route-planner
description: Plan, retrieve, export, and safely create Strava cycling route artifacts using the local Strava API CLI. Use this skill whenever the user asks to plan a ride, road bike route, bikepacking trip, cycling tour, route variant, GPX or TCX file, Strava route, route from another athlete, distance/elevation-constrained ride, cafe ride, endurance loop, or wants a route added to Strava. Use it even if the user says "trip", "tour", "loop", "ride plan", "Sunday ride", or "bikepacking" without explicitly saying Strava. GPX/TCX generation requires real route geometry from an export or configured routing backend.
---

# Strava Route Planner

Use this skill to plan road cycling routes, day rides, bikepacking stages, and Strava route artifacts. The skill should produce useful route plans first, then use `strava-local` for Strava reads, exports, and safe route artifact actions when available.

## Safety model

Allowed operations:

- List existing Strava routes.
- Retrieve route details.
- Export routes as GPX or TCX.
- Create local route briefs.
- Create GPX/TCX files only from real route geometry, such as an existing Strava export or a configured routing backend.
- Create a new Strava route only if `strava-local` supports it through an official API path and the user confirms immediately before creation.

Do not:

- Delete routes.
- Edit existing routes unless a future skill version explicitly supports it.
- Edit or delete activities.
- Change privacy settings on historical Strava data.
- Use browser automation for Strava route creation unless the user explicitly asks for that approach.

Before creating anything in Strava, summarize the route and ask for explicit confirmation immediately before the create command. External writes should feel deliberate and auditable.

Route files can expose sensitive home, workplace, and travel patterns. Keep final responses privacy-conscious: report local file paths and high-level summaries, but avoid pasting full coordinates or private route details unless the user asks.

## Default assumptions

If the user does not specify otherwise:

- Bike: road bike.
- Surface: paved and road-bike-safe.
- Preference: avoid busy roads where practical.
- Output directory: `strava-output/` in the current working directory.
- Route planning output: Markdown route brief plus a JSON summary.
- Strava creation: GPX/manual-upload fallback unless `strava-local` reports official route creation support.

These defaults are meant to keep the route useful without over-questioning. Ask only for missing details that materially change the plan.

## Workflow

1. Identify the task type:
   - quick route idea
   - concrete GPX/TCX artifact
   - route added to Strava
   - existing Strava route retrieval/export
   - bikepacking itinerary
2. Clarify the minimum useful constraints if they are missing:
   - start location
   - finish location, or loop requirement
   - target distance or time budget
   - maximum or desired elevation
   - bike type and surface tolerance
   - purpose: recovery, endurance, intervals, climbing, scenic, adventure, commute, bikepacking
   - resupply, cafe, water, or overnight preferences
3. Check available tooling before promising a generated route:
   - `command -v strava-local`
   - `strava-local --help`
   - `strava-local routes --help`
   - inspect relevant subcommand help before nontrivial actions, especially create/export commands
4. If no routing backend is configured, create a structured route brief and explain what is needed to generate turn-by-turn GPX.
5. Save artifacts locally, using clear names under `strava-output/`.
6. Report paths and any Strava route IDs or links created/exported.

## Planning questions

Ask concise follow-up questions when the answer would meaningfully affect the route. Prefer grouped questions over an interrogation.

High-value questions:

- Where should it start? Should it finish there too?
- Is distance or ride time the hard constraint?
- Is there a maximum elevation gain?
- Road bike only, or are gravel/hardpack sections acceptable?
- Do they want scenic, fast, quiet, climbing-focused, recovery, or endurance?
- Any mandatory stops, avoid areas, ferry/train segments, border crossings, or return logistics?
- For bikepacking: preferred daily distance, lodging style, and how much climbing per day is acceptable?

If the user asks for something like “plan me an 80 km loop from Munich”, you have enough to draft a plan. Mention assumptions instead of blocking on details.

## Using `strava-local`

Use the local CLI for Strava data access and route artifacts. It expects Strava API credentials to be available through environment variables such as `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REFRESH_TOKEN`, often loaded from 1Password outside the repository. If auth fails, distinguish missing/expired credentials from missing route-generation capability.

Discover the installed CLI before relying on examples:

```bash
command -v strava-local
strava-local --help
strava-local routes --help
```

Expected commands include:

```bash
strava-local routes list --athlete-id me --out strava-output/routes.json
strava-local routes get <route-id> --out strava-output/route-<route-id>.json
strava-local routes export <route-id> --format gpx --out strava-output/route-<route-id>.gpx
strava-local routes export <route-id> --format tcx --out strava-output/route-<route-id>.tcx
```

Potential route creation command, only if supported, backed by a real GPX file, and explicitly confirmed immediately before creation:

```bash
strava-local routes create \
  --name "Sunday road loop" \
  --description "Road-bike-safe scenic endurance loop." \
  --gpx strava-output/sunday-road-loop.gpx \
  --private true \
  --confirm-create \
  --out strava-output/created-route.json
```

If `strava-local` is unavailable, say so and provide the exact command you would have run. Do not invent Strava API results.

Common error handling:

- Missing CLI: explain that `strava-local` is required for Strava reads/exports and continue with a route brief if useful.
- Missing or expired auth: ask the user to load credentials, then retry. Do not print secrets.
- Empty route list: say no matching routes were found and offer to draft a new route brief.
- Unsupported route creation: save/export GPX when possible and give manual-upload instructions instead.
- Missing routing backend: do not create GPX/TCX from guessed coordinates.

## Output format: route recommendation

Use this structure for route plans:

```markdown
# Route plan: [name]

## Summary
- Distance:
- Elevation:
- Start:
- Finish:
- Bike:
- Surface:
- Purpose:

## Why this route fits

## Suggested shape

## Route notes

## Cafe, water, and resupply

## Risks and checks

## Strava artifacts
- Route brief:
- GPX:
- TCX:
- Strava route id/link:
```

## Output format: bikepacking

Use this structure for multi-day plans:

```markdown
# Bikepacking plan: [name]

## Overview
- Total distance:
- Total elevation:
- Days:
- Bike:
- Surface:
- Lodging style:

## Stages
| Day | From | To | Distance | Elevation | Sleep | Notes |
| --- | --- | --- | ---: | ---: | --- | --- |

## Resupply and overnight notes

## Road bike suitability

## Risks, checks, and bailouts

## Files / Strava routes
```

## Local artifact conventions

Create `strava-output/` if route artifacts are requested. GPX/TCX files require real geometry from an existing export or routing backend. Prefer these filenames:

- `route-brief.md`
- `route-brief.json`
- `<route-slug>.gpx`
- `<route-slug>.tcx`
- `routes.json` for route lists
- `created-route.json` for Strava creation responses

The JSON brief should be stable and simple:

```json
{
  "name": "Sunday road loop",
  "type": "road_ride",
  "start": "Munich, Germany",
  "finish": "Munich, Germany",
  "loop": true,
  "target_distance_km": 80,
  "target_elevation_m": {"max": 900},
  "bike": "road",
  "surface": "paved",
  "purpose": "scenic endurance",
  "constraints": [],
  "stops": [],
  "artifacts": {}
}
```

## When route creation or routing is unsupported

Strava is not a general-purpose routing engine, and the official API may not support route creation for the current app/scope. If the local setup cannot create Strava routes or generate turn-by-turn geometry, be explicit:

- Provide a high-quality route brief.
- Save the brief as Markdown/JSON if requested.
- Explain that GPX generation needs a routing backend such as OpenRouteService, GraphHopper, OSRM, Komoot export, or an existing Strava route export.
- Offer next steps: connect a routing backend, export an existing Strava route, or manually build the route in Strava/Komoot using the brief.

Do not fabricate GPX coordinates. A GPX file with made-up geometry is worse than no GPX.

## Existing route selection

When the user asks to find an existing route, use `strava-local routes list` and inspect the exported JSON. Rank candidates by the user's constraints:

- distance/time fit
- elevation fit
- location/name match
- surface hints from name/description when available
- purpose fit, such as endurance vs climbing

Export the selected route only after explaining why it is the best match. If the user asked to export directly, no extra confirmation is needed for read-only export.

## Bikepacking planning

For bikepacking, optimize for feasible days rather than perfect total distance. Include:

- stage distance and climbing range
- likely sleep towns or lodging areas
- resupply and water notes
- road-bike suitability warnings
- bailout options: train stations, larger towns, easier alternates
- border, ferry, pass, and seasonal checks when relevant

If the user gives a route corridor, respect it. If not, propose a sensible corridor and label it as a draft.
