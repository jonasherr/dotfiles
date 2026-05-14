---
name: strava-route-planner
description: Plan cycling routes, bikepacking trips, GPX files, and Strava route artifacts using the local strava-local CLI. Use when the user asks for road bike routes, ride plans, loops, tours, route variants, Strava route exports, GPX generation, distance or elevation constrained rides, or manual Strava route upload artifacts.
---

# Strava Route Planner

Use this skill to plan cycling routes and create local route artifacts for Strava.

## Safety

Allowed:

- List, get, and export existing Strava routes.
- Create local route briefs, route plan JSON, GPX files, and manual upload instructions.

Forbidden:

- Delete or edit Strava routes.
- Edit or delete activities.
- Directly create routes through Strava unless a future official API endpoint is verified and explicitly implemented.

## Workflow

1. Clarify start, finish or loop, target distance, bike, surface, elevation preference, scenic or training purpose, time budget, and resupply needs.
2. If reading Strava routes, use:

```bash
strava-local routes list --athlete-id me --out routes.json
strava-local routes get ROUTE_ID --out route.json
strava-local routes export ROUTE_ID --format gpx --out route.gpx
```

3. For a new route artifact, scaffold a plan:

```bash
strava-local route-plan scaffold --start "Munich, Germany" --distance-km 80 --bike road --surface paved --out plan.json
```

4. Add waypoints or trackpoints as `{ "lat": number, "lon": number, "name"?: string }` before generating GPX.
5. Generate GPX only when geometry exists:

```bash
strava-local route-plan gpx --plan plan.json --out route.gpx
strava-local routes prepare-upload --name "Sunday loop" --gpx route.gpx --out upload-instructions.json
```

## Output format

```markdown
# Route plan: [name]

## Summary
- Distance:
- Elevation:
- Start:
- Finish or loop:
- Bike:
- Surface:

## Why this fits
## Key waypoints
## Risks and caveats
## Files created
## Strava upload instructions
```

If actual turn-by-turn routing is needed and no routing backend is configured, create a structured route brief and explain what external routing data is still required.
