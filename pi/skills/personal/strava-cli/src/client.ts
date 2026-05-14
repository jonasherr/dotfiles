import { refreshAccessToken } from "./auth.js"
import type { HttpMethod, JsonValue } from "./types.js"

const API_BASE = "https://www.strava.com/api/v3"
const BLOCKED_METHODS = new Set<HttpMethod>(["DELETE", "PUT", "PATCH"])

function assertSafe(method: HttpMethod, path: string): void {
  if (BLOCKED_METHODS.has(method)) {
    throw new Error(`${method} is blocked. This CLI does not edit or delete Strava data.`)
  }
  if (method === "POST" && path !== "/routes") {
    throw new Error(`POST ${path} is not allowed. Only explicit route creation is permitted.`)
  }
}

export async function apiRequest<T = JsonValue>(
  method: HttpMethod,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  body?: JsonValue,
): Promise<T> {
  assertSafe(method, path)

  const token = await refreshAccessToken()
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token.access_token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get("content-type") ?? ""
  const data = contentType.includes("application/json") ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(`Strava API error ${response.status} ${method} ${path}: ${JSON.stringify(data)}`)
  }

  return data as T
}

export function assertReadOnlyApiMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase() as HttpMethod
  if (normalized !== "GET") throw new Error("The generic api command only supports GET requests.")
  return normalized
}
