// RFC 822 header parsing + RFC 2047 encoded-word decoding + address parsing.
//
// Mail.app stores everything as standard RFC 822, so the wire format is well
// understood. We handle:
//   - line unfolding (continuation lines starting with whitespace)
//   - encoded-words `=?charset?B?...?=` and `=?charset?Q?...?=`
//   - quoted-printable and base64 word payloads
//   - mailbox lists with display names and angle-bracketed addresses

import type { Address } from "./types.js"

export interface ParsedHeaders {
  raw: Record<string, string[]> // last-write-wins not great here, keep arrays
  get(name: string): string | undefined
  getAll(name: string): string[]
}

/** Split an .emlx message buffer into (headers, body). Returns the raw bytes
 *  for the body so MIME parsing can handle non-UTF8 encodings later. */
export function splitHeadersAndBody(msg: Buffer): { headerBlock: string; body: Buffer } {
  // Find first CRLF CRLF or LF LF separator.
  const sep1 = msg.indexOf("\r\n\r\n")
  const sep2 = msg.indexOf("\n\n")
  let sep: number
  let sepLen: number
  if (sep1 === -1 && sep2 === -1) {
    return { headerBlock: msg.toString("utf8"), body: Buffer.alloc(0) }
  } else if (sep1 === -1) {
    sep = sep2
    sepLen = 2
  } else if (sep2 === -1) {
    sep = sep1
    sepLen = 4
  } else {
    if (sep1 < sep2) {
      sep = sep1
      sepLen = 4
    } else {
      sep = sep2
      sepLen = 2
    }
  }
  const headerBlock = msg.slice(0, sep).toString("utf8")
  const body = msg.slice(sep + sepLen)
  return { headerBlock, body }
}

export function parseHeaderBlock(block: string): ParsedHeaders {
  // Unfold: any line starting with whitespace continues the previous one.
  const unfolded: string[] = []
  const lines = block.split(/\r?\n/)
  for (const line of lines) {
    if (line === "") continue
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += " " + line.trim()
    } else {
      unfolded.push(line)
    }
  }
  const raw: Record<string, string[]> = {}
  for (const line of unfolded) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const name = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (!raw[name]) raw[name] = []
    raw[name].push(value)
  }
  return {
    raw,
    get(name) {
      const arr = raw[name.toLowerCase()]
      return arr ? arr[arr.length - 1] : undefined
    },
    getAll(name) {
      return raw[name.toLowerCase()] ?? []
    },
  }
}

// --- RFC 2047 encoded-word decoding ----------------------------------------

const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g

export function decodeEncodedWords(input: string): string {
  if (!input.includes("=?")) return input
  // First pass: replace each encoded word, joining adjacent encoded words
  // without intervening whitespace (per RFC 2047 §6.2).
  let prev = -1
  let prevEnd = -1
  let out = ""
  ENCODED_WORD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  let lastIndex = 0
  while ((m = ENCODED_WORD_RE.exec(input)) !== null) {
    const start = m.index
    const end = start + m[0].length
    // Append any literal text between encoded words. If the gap is only
    // whitespace AND we had an encoded word immediately before, eat it.
    const gap = input.slice(lastIndex, start)
    if (!(prev !== -1 && /^[ \t]+$/.test(gap))) {
      out += gap
    }
    const charset = m[1]
    const enc = m[2].toUpperCase()
    const payload = m[3]
    out += decodeWord(charset, enc, payload)
    prev = start
    prevEnd = end
    lastIndex = end
  }
  out += input.slice(lastIndex)
  return out
}

function decodeWord(charset: string, enc: "B" | "Q" | string, payload: string): string {
  try {
    let bytes: Buffer
    if (enc === "B") {
      bytes = Buffer.from(payload, "base64")
    } else if (enc === "Q") {
      // Q-encoding: _ is space; =XX hex.
      const replaced = payload.replace(/_/g, " ")
      bytes = decodeQuotedPrintable(replaced)
    } else {
      return payload
    }
    return decodeBytes(bytes, charset)
  } catch {
    return payload
  }
}

export function decodeQuotedPrintable(input: string): Buffer {
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === "=") {
      const hex = input.slice(i + 1, i + 3)
      if (hex === "\r\n" || hex === "\n\r") {
        i += 2
        continue
      }
      if (hex.length === 2 && /[0-9a-fA-F]{2}/.test(hex)) {
        out.push(parseInt(hex, 16))
        i += 2
        continue
      }
      // soft line break "=\n" or malformed; drop
      if (input[i + 1] === "\n") {
        i += 1
        continue
      }
      out.push(c.charCodeAt(0))
    } else {
      out.push(c.charCodeAt(0))
    }
  }
  return Buffer.from(out)
}

export function decodeBytes(buf: Buffer, charset: string): string {
  const cs = charset.toLowerCase().replace(/[_\s]/g, "")
  // Node's TextDecoder covers a lot, but not all legacy encodings. Fall back
  // to utf-8 then latin1 if decoding fails.
  try {
    return new TextDecoder(cs, { fatal: false }).decode(buf)
  } catch {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf)
    } catch {
      return buf.toString("latin1")
    }
  }
}

// --- Address parsing -------------------------------------------------------

/** Parse a header value containing a list of mailboxes (From, To, Cc, ...). */
export function parseAddressList(value: string | undefined): Address[] {
  if (!value) return []
  const decoded = decodeEncodedWords(value)
  // Split on commas not inside quotes or angle brackets.
  const parts: string[] = []
  let depth = 0
  let inQuote = false
  let buf = ""
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded[i]
    if (c === "\\" && i + 1 < decoded.length) {
      buf += c + decoded[i + 1]
      i++
      continue
    }
    if (c === '"') inQuote = !inQuote
    if (!inQuote) {
      if (c === "<") depth++
      else if (c === ">") depth = Math.max(0, depth - 1)
      else if (c === "," && depth === 0) {
        if (buf.trim()) parts.push(buf.trim())
        buf = ""
        continue
      }
    }
    buf += c
  }
  if (buf.trim()) parts.push(buf.trim())
  return parts.map(parseOneAddress).filter((a): a is Address => a !== null)
}

function parseOneAddress(s: string): Address | null {
  // Patterns:
  //   "Name" <addr@host>
  //   Name <addr@host>
  //   <addr@host>
  //   addr@host
  //   addr@host (Name)
  const angle = s.match(/^(.*?)<([^>]+)>\s*$/)
  if (angle) {
    const namePart = angle[1].trim().replace(/^"|"$/g, "").trim()
    const address = angle[2].trim()
    if (!address.includes("@")) return null
    return { name: namePart || null, address }
  }
  const paren = s.match(/^([^()]+?)\s*\(([^)]+)\)\s*$/)
  if (paren) {
    const address = paren[1].trim()
    const name = paren[2].trim()
    if (!address.includes("@")) return null
    return { name: name || null, address }
  }
  const trimmed = s.trim()
  if (trimmed.includes("@")) return { name: null, address: trimmed }
  return null
}

export function parseSingleAddress(value: string | undefined): Address | null {
  const list = parseAddressList(value)
  return list[0] ?? null
}

// --- Subject + Date helpers ------------------------------------------------

export function decodeSubject(value: string | undefined): string {
  if (!value) return ""
  return decodeEncodedWords(value).replace(/\s+/g, " ").trim()
}

export function parseDate(value: string | undefined): { iso: string; ms: number } {
  if (!value) return { iso: "", ms: 0 }
  const t = Date.parse(value)
  if (Number.isNaN(t)) return { iso: "", ms: 0 }
  return { iso: new Date(t).toISOString(), ms: t }
}

export function parseMessageIdList(value: string | undefined): string[] {
  if (!value) return []
  const out: string[] = []
  const re = /<([^>]+)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) out.push(m[1])
  return out
}
