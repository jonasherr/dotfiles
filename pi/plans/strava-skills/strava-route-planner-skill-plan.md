# Plan: `strava-route-planner` skill

## Goal

Create a skill that helps plan road cycling routes, day rides, and bikepacking trips, then uses the local `strava-local` CLI to create or export route artifacts for Strava.

The skill should understand constraints like distance, start/end point, road bike suitability, elevation, surface, scenic preferences, resupply, overnight stops, and training purpose.

## Skill name

`strava-route-planner`

## Draft description

Plan, create, retrieve, and export Strava cycling routes using the local Strava API CLI. Use this skill whenever the user asks to plan a ride, road bike route, bikepacking trip, cycling tour, route variant, GPX file, Strava route, route from another athlete, distance/elevation-constrained ride, or wants a route added to Strava. This skill should be used even if the user says “trip”, “tour”, “loop”, “ride plan”, or “bikepacking” without explicitly saying Strava.

## Dependencies

- `strava-local` CLI from `strava-cli-plan.md`.
- Strava API credentials available through environment variables, ideally loaded from 1Password.
- Optional future routing backend for actual turn-by-turn route generation.

## Intended capabilities

### Planning

Help the user refine:

- start location
- end location or loop requirement
- target distance
- maximum or desired elevation
- bike type, default road bike
- surface preference, default paved/road-bike-safe
- intensity, scenic, endurance, recovery, climbing, or adventure
- time budget
- cafe/water/resupply preferences
- avoid busy roads where possible
- bikepacking overnight stops and daily stage distances

### Strava data actions

Allowed:

- list existing routes
- retrieve route details
- export route GPX/TCX
- create a new route if the official API supports it through `strava-local`
- otherwise create GPX files and clear manual-upload instructions

Not allowed:

- delete routes
- edit existing routes without explicit future design
- edit or delete activities
- change privacy settings of old data

## Skill workflow

1. Clarify the route objective if missing.
2. Check whether the user wants:
   - a quick route idea
   - a concrete GPX file
   - a route added to Strava
   - route retrieval from Strava
   - bikepacking itinerary
3. Gather enough constraints to avoid making a useless route.
4. Use `strava-local` for Strava reads and route export/create actions.
5. If actual routing requires an external backend that is not configured, create a structured route brief and explain what is needed to generate the GPX.
6. Before creating anything in Strava, summarize the route and ask for confirmation unless the user already gave explicit confirmation in the same turn.
7. Save generated artifacts locally:
   - route brief JSON/Markdown
   - GPX/TCX if generated
   - Strava creation response if created

## Suggested SKILL.md structure

```markdown
---
name: strava-route-planner
description: ...
---

# Strava Route Planner

Use this skill to plan road cycling routes, bikepacking stages, and Strava route artifacts.

## Safety model

Allowed and forbidden operations...

## Workflow

## Route planning questions

## Using strava-local

## Output formats

## Bikepacking planning

## When the API cannot create routes
```

## Output formats

For route recommendations:

```markdown
# Route plan: [name]

## Summary
- Distance:
- Elevation:
- Start:
- Finish:
- Bike:
- Surface:

## Why this route fits

## Route notes

## Risks and checks

## Strava artifacts
- GPX:
- Strava route id/link:
```

For bikepacking:

```markdown
# Bikepacking plan: [name]

## Overview

## Stages
| Day | From | To | Distance | Elevation | Notes |

## Resupply and overnight notes

## Road bike suitability

## Files / Strava routes
```

## Test prompts for later evals

Use mocked Strava responses and local fixture files rather than real private data.

1. “Plan me an 80 km road bike loop from Munich for Sunday, max 900 m climbing, scenic, with a cafe stop. If possible create it as a Strava route.”
2. “I want a 4-day road-bike bikepacking route from Munich to Lake Garda, around 100 to 140 km per day. Keep it paved and tell me where to sleep.”
3. “Find my existing Strava routes around Girona and export the best one for a 3 hour endurance ride as GPX.”

## Open questions for implementation agent

- Does the current official Strava API support route creation for this app scope? Verify before implementing.
- Which routing backend should be used first for GPX generation?
- Where should generated files live by default? Suggested: current working directory under `strava-output/`.
