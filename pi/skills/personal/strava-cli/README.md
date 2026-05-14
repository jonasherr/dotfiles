# strava-local

Conservative local TypeScript CLI for the Strava API.

## Setup

Keep credentials outside this repo. The CLI reads `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REFRESH_TOKEN` from the environment. If they are unset, it falls back to 1Password CLI fields at `op://Private/Strava API/{client_id,client_secret,refresh_token}` when a command needs Strava auth.

## Install/build

```bash
cd "$DOTFILES/pi/skills/personal/strava-cli"
pnpm install
pnpm build
```

Run directly:

```bash
$DOTFILES/pi/skills/personal/strava-cli/strava-local whoami
```

## Commands

```bash
strava-local whoami --out athlete.json
strava-local api GET /athlete --json

strava-local activities list --after 2026-01-01 --before 2026-02-01 --per-page 100 --page 1 --out activities.json
strava-local activities list --after 2026-01-01 --before 2026-02-01 --per-page 100 --all --max-pages 10 --out activities.json
strava-local activities get <activity-id> --out activity.json
strava-local activities streams <activity-id> --out streams.json
strava-local activities zones <activity-id> --out zones.json

strava-local athlete stats --out stats.json
strava-local routes list --athlete-id me --per-page 100 --all --out routes.json
strava-local routes get <route-id> --out route.json
strava-local routes export <route-id> --format gpx --out route.gpx
strava-local routes prepare-upload --name "Sunday loop" --gpx route.gpx --out upload-instructions.json

strava-local training export --after 2026-01-01 --before 2026-03-01 --sport cycling --out activities-normalized.json
strava-local training weekly --after 2026-01-01 --before 2026-03-01 --from-file activities.json --out weekly.json
strava-local training summary --after 2026-01-01 --before 2026-03-01 --from-file activities-normalized.json --out summary.json

strava-local route-plan scaffold --start "Munich, Germany" --distance-km 80 --bike road --surface paved --elevation max-1200 --out plan.json
strava-local route-plan validate --plan plan-with-geometry.json
strava-local route-plan gpx --plan plan-with-geometry.json --out route.gpx
```

## Safety

Blocked before token refresh or any Strava API request:

- absolute or protocol-relative API URLs
- generic API methods other than `GET`
- `POST`, `DELETE`, `PUT`, and `PATCH`
- unknown `activities` and `routes` subcommands

`routes create` was intentionally removed. Use `routes prepare-upload` plus the generated GPX for manual Strava route upload.

API error output redacts token-looking fields.

## Stable output shapes

- `training export`: `{ generated_at, date_range, source, activities }`, where each activity contains normalized fields like `id`, `sport_type`, `distance_m`, `moving_time_s`, `elevation_gain_m`, HR, power, cadence, and sensor availability values.
- `training weekly`: `{ generated_at, date_range, source, weeks }`, where each week contains counts, distance, moving/elapsed time, elevation, longest activity, and unweighted activity means for HR/power/cadence.
- `training summary`: `{ generated_at, date_range, source, totals, consistency, longest_activity, weekly_progression, data_availability, caveats }`.
- `route-plan validate`: `{ ok, schema, waypoint_count, trackpoint_count }`.

`--sport cycling` expands to common cycling variants like `Ride`, `VirtualRide`, and `GravelRide`. `--sport running` expands to `Run`, `TrailRun`, and `VirtualRun`.
