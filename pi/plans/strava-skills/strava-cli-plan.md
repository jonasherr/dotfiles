# Plan: Strava local CLI

## Goal

Create a small local CLI that wraps the Strava API for the two skills:

- Route planning and route creation.
- Training data retrieval and analysis.

The CLI should be conservative by default. It may read data and create new route artifacts, but it must not delete or edit existing Strava activities, routes, or profile data.

## Suggested name

`strava-local`

Install location options:

- Preferred for dotfiles: `$DOTFILES/bin/strava-local` or `$DOTFILES/strava-cli/strava-local` with a symlink into `$HOME/.local/bin`.
- Avoid hardcoded home paths.

## Authentication

Use OAuth credentials stored outside the repo.

Preferred setup with 1Password:

```bash
export STRAVA_CLIENT_ID="$(op read 'op://Personal/Strava API/client_id')"
export STRAVA_CLIENT_SECRET="$(op read 'op://Personal/Strava API/client_secret')"
export STRAVA_REFRESH_TOKEN="$(op read 'op://Personal/Strava API/refresh_token')"
```

The CLI should accept these env vars:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

The CLI should refresh access tokens automatically via:

`POST https://www.strava.com/oauth/token`

Never print secrets. If debug logging is added, redact tokens.

## Tech choice

Use Python 3 for portability and simple JSON/HTTP handling.

Suggested layout:

```text
strava-cli/
├── strava-local
├── strava_local/
│   ├── __init__.py
│   ├── auth.py
│   ├── client.py
│   ├── routes.py
│   ├── activities.py
│   └── export.py
└── README.md
```

Use only standard library at first if possible:

- `argparse`
- `json`
- `urllib.request`
- `datetime`
- `csv`

If needed later, add `requests`, but keep dependency setup explicit.

## CLI commands

### Auth and diagnostics

```bash
strava-local whoami
strava-local api GET /athlete
```

`api` should support safe read-only requests only, unless a command explicitly allows creation.

### Activity data

```bash
strava-local activities list --after 2026-01-01 --before 2026-02-01 --per-page 100 --out activities.json
strava-local activities get <activity-id> --out activity.json
strava-local activities streams <activity-id> --keys time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp --out streams.json
strava-local activities zones <activity-id> --out zones.json
strava-local athlete stats --out stats.json
```

Relevant API areas:

- Activities: list/get activities.
- Streams: get activity streams.
- Athletes: authenticated athlete and stats.

### Routes

```bash
strava-local routes list --athlete-id me --out routes.json
strava-local routes get <route-id> --out route.json
strava-local routes export <route-id> --format gpx --out route.gpx
strava-local routes create --name "Sunday road loop" --description "..." --gpx route.gpx --private true --out created-route.json
```

Important: confirm whether Strava's public API currently supports route creation directly. If not, implement creation as one of these safe alternatives:

1. Generate GPX/TCX files for manual upload to Strava.
2. Use Strava-compatible route import endpoints only if officially available and stable.
3. If route creation is not possible through the official API, the CLI should say so clearly and provide the GPX output path.

Do not use browser automation to click through Strava unless the user explicitly asks for it later.

### Route planning support

The Strava API is not a full routing engine. The CLI should support route artifacts, but route generation may need an external routing service later.

Suggested commands:

```bash
strava-local route-plan scaffold \
  --start "Munich, Germany" \
  --distance-km 80 \
  --bike road \
  --surface paved \
  --elevation max-1200 \
  --out plan.json

strava-local route-plan gpx --plan plan.json --out route.gpx
```

Initially, this can create structured planning files and accept externally produced GPX. Later, add routing backends:

- OpenRouteService
- GraphHopper
- Komoot export/import if available
- OSRM for simple routing

Keep backend tokens separate from Strava tokens.

## Safety rules

Hard block these operations:

- `DELETE` requests.
- `PUT`/`PATCH` against activities, routes, athlete profile, gear, or clubs.
- Editing existing activities.
- Deleting routes.
- Changing privacy settings on historical data.

Allow only:

- `GET` requests.
- token refresh.
- route creation/import, if supported.
- local file creation.

For any command that creates something in Strava:

- Print a summary first.
- Require `--confirm-create` unless running in a documented non-interactive mode.
- Save the request payload to a local JSON file for auditability.

## Output format

Every command should support `--out <path>`.

Default stdout should be human-readable. `--json` should emit machine-readable JSON.

Use stable JSON shapes so skills can parse them.

## Implementation phases

### Phase 1: Read-only MVP

- OAuth token refresh.
- `whoami`.
- list activities.
- get activity details.
- get streams.
- list/get/export routes.
- safety guard against destructive methods.

### Phase 2: Training export helpers

- Date range export.
- Weekly aggregation JSON/CSV.
- Activity summaries with distance, moving time, elapsed time, elevation, HR, power, cadence, pace/speed.

### Phase 3: Route planning artifacts

- Route planning JSON schema.
- GPX import/export helpers.
- Add route creation if supported by official Strava API.
- If unsupported, document manual upload fallback.

### Phase 4: Routing backend

- Add optional routing provider integration.
- Keep provider-specific docs in `references/` for the route planner skill.

## Acceptance checks

- Running without credentials gives a helpful setup message.
- `whoami` succeeds with valid credentials.
- `activities list` can export a date range to JSON.
- `activities streams` can export HR/power/cadence when available.
- Destructive API methods are rejected before any network call.
- Route creation either works through an official API path or clearly falls back to GPX output.
