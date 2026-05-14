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

Or symlink `strava-local` into a directory on your PATH.

## Commands

```bash
strava-local whoami --out athlete.json
strava-local api GET /athlete --json
strava-local activities list --after 2026-01-01 --before 2026-02-01 --per-page 100 --out activities.json
strava-local activities get <activity-id> --out activity.json
strava-local activities streams <activity-id> --keys time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp --out streams.json
strava-local activities zones <activity-id> --out zones.json
strava-local athlete stats --out stats.json
strava-local routes list --athlete-id me --out routes.json
strava-local routes get <route-id> --out route.json
strava-local routes export <route-id> --format gpx --out route.gpx
strava-local route-plan scaffold --start "Munich, Germany" --distance-km 80 --bike road --surface paved --elevation max-1200 --out plan.json
strava-local route-plan gpx --plan plan.json --out route.gpx
```

## Safety

Blocked before any network call:

- `DELETE`
- `PUT` and `PATCH`
- generic `POST`

Only `GET`, token refresh, local file creation, and explicit route creation are allowed. Route creation requires `--confirm-create` and writes `strava-route-create-payload.json` for auditability.

Note: Strava's public API may not support direct route creation for all apps/accounts. If `routes create` fails, use the generated GPX file and upload it manually.
