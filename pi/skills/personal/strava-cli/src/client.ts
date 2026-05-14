import { refreshAccessToken } from "./auth.js"
import { redactSecrets } from "./redact.js"
import type { HttpMethod, JsonValue } from "./types.js"

const API_BASE = "https://www.strava.com/api/v3"
const BLOCKED_METHODS = new Set<HttpMethod>(["DELETE", "PUT", "PATCH", "POST"])

function assertApiPath(path: string): void {
  if (!path.startsWith("/")) {
    throw new Error("API path must start with /. Absolute URLs are blocked.")
  }
  if (path.startsWith("//")) {
    throw new Error("Protocol-relative API URLs are blocked.")
  }
}

function assertSafe(method: HttpMethod, path: string): void {
  assertApiPath(path)
  if (BLOCKED_METHODS.has(method)) {
    throw new Error(`${method} is blocked. This CLI only performs read-only Strava API requests.`)
  }
}

export interface ApiResult<T = JsonValue> {
  data: T
  rateLimit?: string
  rateLimitUsage?: string
}

export async function apiRequestWithMeta<T = JsonValue>(
  method: HttpMethod,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ApiResult<T>> {
  assertSafe(method, path)

  const token = await refreshAccessToken()
  const url = new URL(`${API_BASE}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token.access_token}` },
  })

  const contentType = response.headers.get("content-type") ?? ""
  const data = contentType.includes("application/json") ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(`Strava API error ${response.status} ${method} ${path}: ${JSON.stringify(redactSecrets(data))}`)
  }

  return {
    data: data as T,
    rateLimit: response.headers.get("x-ratelimit-limit") ?? undefined,
    rateLimitUsage: response.headers.get("x-ratelimit-usage") ?? undefined,
  }
}

export async function apiRequest<T = JsonValue>(
  method: HttpMethod,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  return (await apiRequestWithMeta<T>(method, path, query)).data
}

export function assertReadOnlyApiMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase() as HttpMethod
  if (normalized !== "GET") throw new Error("The generic api command only supports GET requests.")
  return normalized
}
