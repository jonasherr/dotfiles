export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type HttpMethod = "GET" | "POST" | "DELETE" | "PUT" | "PATCH"

export interface CliOptions {
  out?: string
  json: boolean
}

export interface TokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
}
