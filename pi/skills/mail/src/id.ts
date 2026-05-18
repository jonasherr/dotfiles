// Opaque message IDs. We use base64url of the absolute filesystem path so IDs
// are stable across runs (Mail.app never moves an .emlx once written), and
// decodable back to a path without any index.

import { homedir } from "node:os"
import { resolve } from "node:path"

const HOME = homedir()

export function encodeId(absPath: string): string {
  // Store paths relative to $HOME when possible to keep IDs short and to
  // make them portable across machines that share a Mail.app config.
  const rel = absPath.startsWith(HOME + "/") ? "~" + absPath.slice(HOME.length) : absPath
  return Buffer.from(rel, "utf8").toString("base64url")
}

export function decodeId(id: string): string {
  const rel = Buffer.from(id, "base64url").toString("utf8")
  if (rel.startsWith("~/")) return resolve(HOME, rel.slice(2))
  return rel
}
