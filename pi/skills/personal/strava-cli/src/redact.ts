const SECRET_FIELD_PATTERN = /(access_token|refresh_token|client_secret|authorization|token)/i

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, SECRET_FIELD_PATTERN.test(key) ? "[redacted]" : redactSecrets(entry)]),
    )
  }
  if (typeof value === "string" && /[A-Za-z0-9_-]{24,}/.test(value)) return "[redacted]"
  return value
}
