# Plan: fix Strava CLI QA findings

## Goal

Make `skills/personal/strava-cli` safe and capable enough to support the future `strava-route-planner` and `strava-training-analyst` skills without each skill reinventing API, pagination, aggregation, or route artifact logic.

## Current baseline

Committed baseline: `7dcaacf strava: add local cli`

The CLI can authenticate, read athlete/activity/route data, export streams, and write local files. Smoke tests against the authenticated account succeeded for `whoami`, `activities list`, `activities streams`, and `athlete stats`.

## Phase 1: safety and command contract

Priority: highest. Do this before adding more features.

1. Block absolute API URLs.
   - Require API paths to start with `/`.
   - Always resolve paths against `https://www.strava.com/api/v3`.
   - Reject `strava-local api GET https://...` before refreshing a token.

2. Add explicit command allowlists.
   - `activities`: allow only `list`, `get`, `streams`, `zones`.
   - `routes`: allow only `list`, `get`, `export`, and the revised local route artifact command.
   - Keep generic `api` read-only and Strava-host-only.

3. Improve route creation safety.
   - Remove or disable network `POST /routes` unless official Strava docs confirm support.
   - Replace with a local/manual-upload flow, for example `routes prepare-upload --gpx route.gpx --name ... --out upload-instructions.json`.
   - Keep `--confirm-create` only if a real official create endpoint is later implemented.

4. Preserve secret safety.
   - Never print access tokens, refresh tokens, or client secret.
   - Redact token-looking fields in API error output if needed.

Acceptance checks:

```bash
strava-local api GET https://example.com
# must fail before token refresh and before any network request

strava-local api DELETE /athlete
# must fail

strava-local activities typo 123
# must fail with a clear unknown-command message
```

## Phase 2: pagination and output stability

Priority: high. Needed for both future skills.

1. Add pagination flags.
   - `--page <n>` for `activities list` and `routes list`.
   - `--all` to fetch all pages in a date range.
   - Keep `--per-page`, capped at Strava's max of 200.

2. Make `--all` conservative.
   - Stop when a page has fewer than `per-page` records or returns an empty array.
   - Add `--max-pages` with a safe default to avoid accidental bulk polling.
   - Surface Strava rate limit headers when available.

3. Define stable normalized exports.
   - Keep raw Strava responses for `activities list/get`.
   - Add normalized commands for skills to parse, for example:
     - `training export --after YYYY-MM-DD --before YYYY-MM-DD --out activities-normalized.json`
     - `training weekly --after YYYY-MM-DD --before YYYY-MM-DD --out weekly.json`
   - Include a `generated_at`, `date_range`, and `source` metadata block.

Acceptance checks:

```bash
strava-local activities list --after 2026-01-01 --before 2026-12-31 --per-page 10 --page 2 --out page-2.json
strava-local activities list --after 2026-01-01 --before 2026-12-31 --per-page 100 --all --out all.json
```

## Phase 3: training analyst helpers

Priority: high for `strava-training-analyst`.

1. Add `training weekly`.
   - Inputs: date range, optional sport filter, output path.
   - Output weekly totals for distance, moving time, elapsed time, elevation, activity count, long activity, average HR/power/cadence when available.
   - Support JSON first. Add CSV after JSON is stable.

2. Add `training summary`.
   - Produce a compact JSON/Markdown-ready summary for skills.
   - Include consistency, rest days, longest ride/run, weekly progression, and data availability.

3. Make streams easier to use.
   - Either require `--keys` clearly or default to:
     `time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp`.
   - Avoid fetching streams in bulk unless explicitly requested.

4. Add fixture-based tests.
   - Use mocked Strava JSON, not private account data.
   - Test week boundary handling, missing HR/power, indoor activities, and mixed sport types.

Acceptance checks:

```bash
strava-local training weekly --after 2026-01-01 --before 2026-03-01 --out weekly.json
strava-local training summary --after 2026-01-01 --before 2026-03-01 --out summary.json
```

## Phase 4: route planner artifacts

Priority: medium-high for `strava-route-planner`.

1. Define a real route plan schema.
   - Fields: name, start, finish/loop, target distance, bike, surface, elevation preference, waypoints, trackpoints, notes.
   - Waypoints and trackpoints should use `{ "lat": number, "lon": number, "name"?: string }`.

2. Make GPX generation valid.
   - If no geometry exists, fail with a clear message instead of writing an empty route.
   - If waypoints exist, emit `<rtept>` entries.
   - If trackpoints exist, emit `<trk><trkseg><trkpt>` entries.

3. Clarify Strava route import limitations.
   - Generate GPX/TCX locally.
   - Output manual upload instructions.
   - Only add direct Strava route creation later if official API support is verified.

4. Prepare for optional routing backends.
   - Keep routing provider tokens separate from Strava tokens.
   - Do not add browser automation unless explicitly requested later.

Acceptance checks:

```bash
strava-local route-plan scaffold --start "Munich, Germany" --distance-km 80 --out plan.json
strava-local route-plan gpx --plan plan-without-geometry.json --out route.gpx
# must fail clearly

strava-local route-plan gpx --plan plan-with-waypoints.json --out route.gpx
# must write GPX with route points
```

## Phase 5: skill implementation readiness

After the CLI fixes above, create the actual skills under `skills/personal/`:

1. `strava-training-analyst`
   - Uses `training weekly`, `training summary`, and selective stream retrieval.
   - Read-only only.
   - Includes report format and caveats around missing sensors and health advice.

2. `strava-route-planner`
   - Uses route list/get/export and route-plan artifact commands.
   - Explains when real routing requires an external backend.
   - Saves route briefs and GPX files locally.

3. Evals
   - Use mocked Strava responses and local fixture files.
   - Do not use private Strava account data in eval fixtures.

## Suggested implementation order

1. Safety patch: absolute URL block, command allowlists, route create fallback.
2. Pagination: `--page`, `--all`, `--max-pages`.
3. Stream key defaults/validation.
4. Training normalized export and weekly summary.
5. Route plan schema validation and valid GPX generation.
6. Add skills and evals.

## Non-goals for now

- Editing or deleting Strava data.
- Changing historical activity privacy or metadata.
- Browser automation for Strava route upload.
- Full routing engine integration.
- Medical diagnosis or injury treatment recommendations.
