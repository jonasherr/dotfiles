// Parse a single .emlx file.
//
// .emlx format (Mail.app):
//   <decimal-length>\n
//   <RFC 822 message of exactly <decimal-length> bytes>
//   <XML plist footer with flags etc.>
//
// We trust the length prefix when present and fall back to a heuristic split
// if the file is malformed.

import { readFileSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { readdirSync, existsSync } from "node:fs"
import type { Attachment, Flags, MessageFull, MessageMeta } from "./types.js"
import { encodeId } from "./id.js"
import {
  decodeSubject,
  parseAddressList,
  parseDate,
  parseHeaderBlock,
  parseMessageIdList,
  parseSingleAddress,
  splitHeadersAndBody,
} from "./headers.js"
import { parseMime, type MimeResult, type ParsedPart } from "./mime.js"
import { htmlToText } from "./html.js"
import { readIntKey } from "./plist.js"

// Mail.app flag bit positions. Subset we care about.
const FLAG_READ = 0n
const FLAG_DELETED = 1n
const FLAG_ANSWERED = 2n
const FLAG_FLAGGED = 4n
const FLAG_DRAFT = 6n
const FLAG_ATTACHMENT_COUNT_SHIFT = 10n
const FLAG_ATTACHMENT_COUNT_BITS = 6n // bits 10..15

export interface EmlxContext {
  accountName: string
  mailboxName: string
}

export function parseEmlxFile(absPath: string, ctx: EmlxContext): MessageFull {
  const buf = readFileSync(absPath)
  return parseEmlxBuffer(absPath, buf, ctx)
}

export function parseEmlxBuffer(absPath: string, buf: Buffer, ctx: EmlxContext): MessageFull {
  const nl = buf.indexOf(0x0a)
  let message: Buffer
  let footer = ""
  if (nl !== -1) {
    const head = buf.slice(0, nl).toString("ascii").trim()
    const len = /^\d+$/.test(head) ? parseInt(head, 10) : NaN
    if (!Number.isNaN(len) && nl + 1 + len <= buf.length) {
      message = buf.slice(nl + 1, nl + 1 + len)
      footer = buf.slice(nl + 1 + len).toString("utf8")
    } else {
      // Treat whole file as message.
      message = buf
    }
  } else {
    message = buf
  }

  const { headerBlock, body } = splitHeadersAndBody(message)
  const headers = parseHeaderBlock(headerBlock)
  const mime: MimeResult = parseMime(message)

  const flagsBigInt = readIntKey(footer, "flags") ?? 0n
  const flags = decodeFlags(flagsBigInt)

  const subject = decodeSubject(headers.get("subject"))
  const from = parseSingleAddress(headers.get("from"))
  const to = parseAddressList(headers.get("to"))
  const cc = parseAddressList(headers.get("cc"))
  const date = parseDate(headers.get("date"))
  let { iso, ms } = date
  if (!ms) {
    try {
      const st = statSync(absPath)
      ms = st.mtimeMs
      iso = new Date(ms).toISOString()
    } catch {
      /* leave empty */
    }
  }

  const attachments = collectAttachments(absPath, mime.parts)
  // Override hasAttachment from flag bitfield with what we actually parsed
  // (the bitfield is unreliable for some IMAP messages).
  flags.hasAttachment = flags.hasAttachment || attachments.length > 0

  let bodyText = mime.text ?? (mime.html ? htmlToText(mime.html) : "")
  bodyText = bodyText.replace(/\r\n/g, "\n").trim()
  const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ").trim()

  const meta: MessageMeta = {
    id: encodeId(absPath),
    path: absPath,
    account: ctx.accountName,
    mailbox: ctx.mailboxName,
    from,
    to,
    cc,
    subject,
    date: iso,
    dateMs: ms,
    messageId: parseMessageIdList(headers.get("message-id"))[0] ?? null,
    inReplyTo: parseMessageIdList(headers.get("in-reply-to"))[0] ?? null,
    references: parseMessageIdList(headers.get("references")),
    snippet,
    flags,
    attachments,
  }

  return {
    ...meta,
    body: bodyText,
    bodyHtml: mime.html,
    headers: headers.raw,
  }
}

function decodeFlags(bits: bigint): Flags {
  const isSet = (bit: bigint) => (bits & (1n << bit)) !== 0n
  const attachmentMask = ((1n << FLAG_ATTACHMENT_COUNT_BITS) - 1n) << FLAG_ATTACHMENT_COUNT_SHIFT
  const attachmentCount = Number((bits & attachmentMask) >> FLAG_ATTACHMENT_COUNT_SHIFT)
  return {
    read: isSet(FLAG_READ),
    deleted: isSet(FLAG_DELETED),
    answered: isSet(FLAG_ANSWERED),
    flagged: isSet(FLAG_FLAGGED),
    draft: isSet(FLAG_DRAFT),
    hasAttachment: attachmentCount > 0,
  }
}

function collectAttachments(emlxPath: string, parts: ParsedPart[]): Attachment[] {
  const out: Attachment[] = []
  // Mail.app stores attachment payloads beside the message. For an .emlx at
  //   .../Messages/<id>.emlx
  // attachments live at
  //   .../Attachments/<id>/<partNumber>/<filename>
  const messagesDir = dirname(emlxPath)
  const id = basename(emlxPath, ".emlx")
  const attDir = join(dirname(messagesDir), "Attachments", id)

  let partIndex = 1
  for (const p of parts) {
    const isAttachment =
      p.disposition === "attachment" || (p.filename && p.disposition !== "inline")
    const isInlineWithFilename = p.disposition === "inline" && p.filename
    if (!isAttachment && !isInlineWithFilename) {
      partIndex++
      continue
    }
    const filename = p.filename ?? `part-${partIndex}`
    // Try a few common locations under the attachments dir.
    let resolved: string | null = null
    if (existsSync(attDir)) {
      // Search nested numeric dirs for a file with this name.
      resolved = findFileNamed(attDir, filename)
    }
    const size = resolved ? safeSize(resolved) : p.body.length
    out.push({
      filename,
      path: resolved ?? "",
      contentType: p.contentType,
      size,
    })
    partIndex++
  }
  return out
}

function findFileNamed(root: string, name: string): string | null {
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }
  for (const e of entries) {
    const full = join(root, e)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      const r = findFileNamed(full, name)
      if (r) return r
    } else if (s.isFile() && e === name) {
      return full
    }
  }
  return null
}

function safeSize(p: string): number | null {
  try {
    return statSync(p).size
  } catch {
    return null
  }
}
