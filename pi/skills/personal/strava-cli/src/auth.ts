import { spawnSync } from "node:child_process"

import { redactSecrets } from "./redact.js"
import type { TokenResponse } from "./types.js"

const ONE_PASSWORD_FIELDS: Record<string, string> = {
  STRAVA_CLIENT_ID: "client_id",
  STRAVA_CLIENT_SECRET: "client_secret",
  STRAVA_REFRESH_TOKEN: "refresh_token",
}

function readOnePasswordField(name: string): string | undefined {
  const field = ONE_PASSWORD_FIELDS[name]
  if (!field) return undefined

  const result = spawnSync("op", ["read", `op://Private/Strava API/${field}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })

  if (result.status !== 0) return undefined

  const value = result.stdout.trim()
  return value || undefined
}

function requireCredential(name: string): string {
  const value = process.env[name] || readOnePasswordField(name)
  if (!value) {
    throw new Error(
      `Missing ${name}. Set Strava credentials outside the repo or sign in to 1Password CLI. Example:\n` +
        `export STRAVA_CLIENT_ID="$(op read 'op://Private/Strava API/client_id')"\n` +
        `export STRAVA_CLIENT_SECRET="$(op read 'op://Private/Strava API/client_secret')"\n` +
        `export STRAVA_REFRESH_TOKEN="$(op read 'op://Private/Strava API/refresh_token')"`,
    )
  }
  return value
}

export async function refreshAccessToken(): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireCredential("STRAVA_CLIENT_ID"),
    client_secret: requireCredential("STRAVA_CLIENT_SECRET"),
    refresh_token: requireCredential("STRAVA_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  })

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${JSON.stringify(redactSecrets(data))}`)
  }

  return data as TokenResponse
}
