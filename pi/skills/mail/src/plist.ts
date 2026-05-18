// Plist reading utilities.
//
// For .emlx footers and other small XML plists, we use regex extraction.
// For binary plists (Mail.app moved several config files to binary format in
// macOS 26), we shell out to `plutil -convert json` and parse the JSON.
//
// We deliberately do NOT pull in an npm plist dependency: macOS always ships
// plutil and binary parsing is uncommon enough to be worth the subprocess.

import { spawnSync } from "node:child_process"

export function readIntKey(xml: string, key: string): bigint | null {
  const re = new RegExp(
    `<key>\\s*${escapeRe(key)}\\s*</key>\\s*<integer>\\s*(-?\\d+)\\s*</integer>`,
    "i",
  )
  const m = xml.match(re)
  return m ? BigInt(m[1]) : null
}

export function readStringKey(xml: string, key: string): string | null {
  const re = new RegExp(
    `<key>\\s*${escapeRe(key)}\\s*</key>\\s*<string>([\\s\\S]*?)</string>`,
    "i",
  )
  const m = xml.match(re)
  return m ? decodeEntities(m[1]) : null
}

export function readStringArrayKey(xml: string, key: string): string[] {
  const re = new RegExp(
    `<key>\\s*${escapeRe(key)}\\s*</key>\\s*<array>([\\s\\S]*?)</array>`,
    "i",
  )
  const m = xml.match(re)
  if (!m) return []
  const out: string[] = []
  const inner = m[1]
  const stringRe = /<string>([\s\S]*?)<\/string>/g
  let sm: RegExpExecArray | null
  while ((sm = stringRe.exec(inner)) !== null) {
    out.push(decodeEntities(sm[1]))
  }
  return out
}

/**
 * Convert any .plist (XML or binary) to a JSON object via macOS's plutil.
 * Returns null on any error (missing file, unreadable, malformed).
 */
export function plutilJson<T = unknown>(path: string): T | null {
  const res = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", path], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  if (res.status !== 0 || !res.stdout) return null
  try {
    return JSON.parse(res.stdout) as T
  } catch {
    return null
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
}
