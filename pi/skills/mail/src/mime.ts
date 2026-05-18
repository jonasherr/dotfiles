// Walk a MIME body and pull out the best text/plain + text/html parts plus
// any attachments (non-inline parts with filenames).

import {
  decodeBytes,
  decodeEncodedWords,
  decodeQuotedPrintable,
  parseHeaderBlock,
  splitHeadersAndBody,
} from "./headers.js"

export interface ParsedPart {
  contentType: string
  charset: string | null
  disposition: string | null
  filename: string | null
  contentId: string | null
  body: Buffer // decoded bytes (after transfer-encoding)
}

export interface MimeResult {
  text: string | null
  html: string | null
  parts: ParsedPart[] // flat list, useful for attachments
}

export function parseMime(msg: Buffer): MimeResult {
  const { headerBlock, body } = splitHeadersAndBody(msg)
  const headers = parseHeaderBlock(headerBlock)
  const ct = parseContentType(headers.get("content-type"))
  const cte = (headers.get("content-transfer-encoding") ?? "7bit").toLowerCase()
  const disp = parseContentDisposition(headers.get("content-disposition"))
  const cid = stripAngles(headers.get("content-id"))

  if (ct.type.startsWith("multipart/") && ct.boundary) {
    const subparts = splitMultipart(body, ct.boundary)
    const merged: MimeResult = { text: null, html: null, parts: [] }
    if (ct.type === "multipart/alternative") {
      // Prefer text/plain; if missing use text/html; collect attachments too.
      for (const sub of subparts) {
        const r = parseMime(sub)
        if (r.text && !merged.text) merged.text = r.text
        if (r.html && !merged.html) merged.html = r.html
        merged.parts.push(...r.parts)
      }
    } else {
      // multipart/mixed, multipart/related, etc. → concatenate.
      for (const sub of subparts) {
        const r = parseMime(sub)
        if (r.text) merged.text = (merged.text ?? "") + (merged.text ? "\n\n" : "") + r.text
        if (r.html) merged.html = (merged.html ?? "") + (merged.html ? "\n" : "") + r.html
        merged.parts.push(...r.parts)
      }
    }
    return merged
  }

  // Leaf part.
  const decoded = decodeTransferEncoding(body, cte)
  const part: ParsedPart = {
    contentType: ct.type,
    charset: ct.params.charset ?? null,
    disposition: disp?.type ?? null,
    filename: disp?.filename ?? ct.params.name ?? null,
    contentId: cid,
    body: decoded,
  }

  const result: MimeResult = { text: null, html: null, parts: [part] }
  if (ct.type === "text/plain" && (!disp || disp.type !== "attachment")) {
    result.text = decodeBytes(decoded, ct.params.charset ?? "utf-8")
  } else if (ct.type === "text/html" && (!disp || disp.type !== "attachment")) {
    result.html = decodeBytes(decoded, ct.params.charset ?? "utf-8")
  }
  return result
}

// --- helpers ---------------------------------------------------------------

interface ContentType {
  type: string
  params: Record<string, string>
  boundary: string | null
}

function parseContentType(raw: string | undefined): ContentType {
  if (!raw) return { type: "text/plain", params: {}, boundary: null }
  const decoded = decodeEncodedWords(raw)
  const [first, ...rest] = decoded.split(";")
  const type = first.trim().toLowerCase()
  const params: Record<string, string> = {}
  for (const p of rest) {
    const eq = p.indexOf("=")
    if (eq === -1) continue
    const k = p.slice(0, eq).trim().toLowerCase()
    let v = p.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    params[k] = v
  }
  return { type, params, boundary: params.boundary ?? null }
}

interface ContentDisposition {
  type: string
  filename: string | null
}

function parseContentDisposition(raw: string | undefined): ContentDisposition | null {
  if (!raw) return null
  const decoded = decodeEncodedWords(raw)
  const [first, ...rest] = decoded.split(";")
  const type = first.trim().toLowerCase()
  let filename: string | null = null
  for (const p of rest) {
    const eq = p.indexOf("=")
    if (eq === -1) continue
    const k = p.slice(0, eq).trim().toLowerCase()
    let v = p.slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (k === "filename" || k === "filename*") filename = v
  }
  return { type, filename }
}

function stripAngles(v: string | undefined): string | null {
  if (!v) return null
  return v.replace(/^<|>$/g, "")
}

function decodeTransferEncoding(body: Buffer, cte: string): Buffer {
  switch (cte) {
    case "base64":
      return Buffer.from(body.toString("ascii").replace(/\s+/g, ""), "base64")
    case "quoted-printable":
      return decodeQuotedPrintable(body.toString("latin1"))
    case "7bit":
    case "8bit":
    case "binary":
    default:
      return body
  }
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
  // Convert body to latin1 string for boundary search (preserving byte offsets),
  // then slice the original buffer.
  const str = body.toString("latin1")
  const marker = "--" + boundary
  const parts: Buffer[] = []
  let i = str.indexOf(marker)
  if (i === -1) return [body]
  // Skip preamble: start at first marker.
  while (i !== -1) {
    const after = i + marker.length
    // End marker?
    if (str.substr(after, 2) === "--") break
    // Find next marker.
    const next = str.indexOf("\n" + marker, after)
    if (next === -1) break
    // Part starts after the CRLF that follows the marker.
    let partStart = after
    if (str[partStart] === "\r") partStart++
    if (str[partStart] === "\n") partStart++
    // Part ends at the CRLF before the next marker.
    let partEnd = next
    if (str[partEnd - 1] === "\r") partEnd--
    parts.push(body.slice(partStart, partEnd))
    i = next + 1 // jump past the leading \n we matched on
  }
  return parts
}
