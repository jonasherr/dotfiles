import type { TokenResponse } from "./types.js"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Set Strava credentials outside the repo, for example with 1Password:\n` +
        `export STRAVA_CLIENT_ID="$(op read 'op://Personal/Strava API/client_id')"\n` +
        `export STRAVA_CLIENT_SECRET="$(op read 'op://Personal/Strava API/client_secret')"\n` +
        `export STRAVA_REFRESH_TOKEN="$(op read 'op://Personal/Strava API/refresh_token')"`,
    )
  }
  return value
}

export async function refreshAccessToken(): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
    refresh_token: requireEnv("STRAVA_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  })

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${JSON.stringify(data)}`)
  }

  return data as TokenResponse
}
