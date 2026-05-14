# strava-local

Conservative local TypeScript CLI for the Strava API.

## Setup

Keep credentials outside this repo. Example with 1Password:

```bash
export STRAVA_CLIENT_ID="$(op read 'op://Personal/Strava API/client_id')"
export STRAVA_CLIENT_SECRET="$(op read 'op://Personal/Strava API/client_secret')"
export STRAVA_REFRESH_TOKEN="$(op read 'op://Personal/Strava API/refresh_token')"
```

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

strava-local training export --after 2026-01-01 --before 2026-03-01 --out activities-normalized.json
strava-local training weekly --after 2026-01-01 --before 2026-03-01 --out weekly.json
strava-local training summary --after 2026-01-01 --before 2026-03-01 --out summary.json

strava-local route-plan scaffold --start "Munich, Germany" --distance-km 80 --bike road --surface paved --elevation max-1200 --out plan.json
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
