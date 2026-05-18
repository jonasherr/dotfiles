// Gmail-style query parser and matcher. Subset of Gmail search syntax that
// makes sense against a local IMAP/POP mirror.

import type { MessageMeta } from "./types.js"

export interface ParsedQuery {
  from: string[]
  to: string[]
  cc: string[]
  /** `with:` matches any of from/to/cc; the convenience operator we use for
   *  "all correspondence with this contact". */
  with: string[]
  subject: string[]
  text: string[]
  account: string | null
  mailbox: string | null
  isUnread: boolean
  isRead: boolean
  isFlagged: boolean
  isAnswered: boolean
  hasAttachment: boolean
  newerThanMs: number | null
  olderThanMs: number | null
  afterMs: number | null
  beforeMs: number | null
  negFrom: string[]
  negTo: string[]
  negSubject: string[]
  negText: string[]
  /** True when the query had `from:me`, `to:me`, `with:me`, or `-from:me`. The
   *  CLI populates `userAddresses` from `listAccounts()` so the matcher and
   *  the envelope SQL can expand `me` to a logical-OR over the user's own
   *  email addresses. Without this, `from:me` would substring-match the
   *  literal letters "me" against every display name and address. */
  fromMe: boolean
  toMe: boolean
  withMe: boolean
  negFromMe: boolean
  /** Filled in by the CLI before matching. Lowercased. */
  userAddresses: string[]
  /** Warnings produced during parsing (unknown operators, ignored values).
   *  The CLI prints them to stderr so the agent notices its query was off
   *  rather than silently returning misleading results. */
  warnings: string[]
}

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = {
    from: [],
    to: [],
    cc: [],
    with: [],
    subject: [],
    text: [],
    account: null,
    mailbox: null,
    isUnread: false,
    isRead: false,
    isFlagged: false,
    isAnswered: false,
    hasAttachment: false,
    newerThanMs: null,
    olderThanMs: null,
    afterMs: null,
    beforeMs: null,
    negFrom: [],
    negTo: [],
    negSubject: [],
    negText: [],
    fromMe: false,
    toMe: false,
    withMe: false,
    negFromMe: false,
    userAddresses: [],
    warnings: [],
  }
  for (const tok of tokenize(input)) {
    const negate = tok.startsWith("-")
    const t = negate ? tok.slice(1) : tok
    const colon = t.indexOf(":")
    if (colon === -1) {
      if (negate) q.negText.push(t.toLowerCase())
      else q.text.push(t.toLowerCase())
      continue
    }
    const key = t.slice(0, colon).toLowerCase()
    const val = stripQuotes(t.slice(colon + 1))
    const v = val.toLowerCase()
    switch (key) {
      case "from":
        if (v === "me") {
          if (negate) q.negFromMe = true
          else q.fromMe = true
        } else if (negate) q.negFrom.push(v)
        else q.from.push(v)
        break
      case "to":
        if (v === "me") {
          // -to:me is unusual; we treat it as a no-op + warning rather than
          // adding a fourth negated-me flag.
          if (negate) q.warnings.push("'-to:me' is not supported; ignoring")
          else q.toMe = true
        } else if (negate) q.negTo.push(v)
        else q.to.push(v)
        break
      case "cc":
        q.cc.push(v)
        break
      case "with":
      case "correspondent":
      case "anywhere":
        if (v === "me") q.withMe = true
        else q.with.push(v)
        break
      case "subject":
        if (negate) q.negSubject.push(v)
        else q.subject.push(v)
        break
      case "account":
        q.account = val
        break
      case "in":
      case "mailbox":
        q.mailbox = val
        break
      case "is":
        switch (v) {
          case "unread":
            q.isUnread = true
            break
          case "read":
            q.isRead = true
            break
          case "flagged":
          case "starred":
            q.isFlagged = true
            break
          case "answered":
          case "replied":
            q.isAnswered = true
            break
          case "sent":
            // Gmail uses `in:sent` for this. Translate to a mailbox filter
            // so the user's intent survives.
            if (q.mailbox) {
              q.warnings.push(`'is:sent' overrides existing 'in:${q.mailbox}'`)
            }
            q.mailbox = "Sent"
            break
          default:
            q.warnings.push(
              `unknown operator 'is:${v}' ignored (supported: unread, read, flagged, answered, sent)`,
            )
        }
        break
      case "has":
        if (v === "attachment" || v === "attachments") q.hasAttachment = true
        else q.warnings.push(`unknown operator 'has:${v}' ignored (only 'has:attachment' is supported)`)
        break
      case "newer_than": {
        const ms = parseRelative(v)
        if (ms !== null) q.newerThanMs = Date.now() - ms
        break
      }
      case "older_than": {
        const ms = parseRelative(v)
        if (ms !== null) q.olderThanMs = Date.now() - ms
        break
      }
      case "after": {
        const t = Date.parse(val)
        if (!Number.isNaN(t)) q.afterMs = t
        break
      }
      case "before": {
        const t = Date.parse(val)
        if (!Number.isNaN(t)) q.beforeMs = t
        break
      }
      default:
        if (negate) q.negText.push(t.toLowerCase())
        else q.text.push(t.toLowerCase())
    }
  }
  return q
}

export function matches(meta: MessageMeta, q: ParsedQuery): boolean {
  if (q.account && meta.account.toLowerCase() !== q.account.toLowerCase()) return false
  if (q.mailbox && !meta.mailbox.toLowerCase().includes(q.mailbox.toLowerCase())) return false
  if (q.isUnread && meta.flags.read) return false
  if (q.isRead && !meta.flags.read) return false
  if (q.isFlagged && !meta.flags.flagged) return false
  if (q.isAnswered && !meta.flags.answered) return false
  if (q.hasAttachment && !meta.flags.hasAttachment) return false
  if (q.newerThanMs && meta.dateMs < q.newerThanMs) return false
  if (q.olderThanMs && meta.dateMs > q.olderThanMs) return false
  if (q.afterMs && meta.dateMs < q.afterMs) return false
  if (q.beforeMs && meta.dateMs > q.beforeMs) return false

  const fromText = addressText(meta.from)
  for (const f of q.from) if (!fromText.includes(f)) return false
  for (const f of q.negFrom) if (fromText.includes(f)) return false
  if (q.fromMe && !q.userAddresses.some((a) => fromText.includes(a))) return false
  if (q.negFromMe && q.userAddresses.some((a) => fromText.includes(a))) return false

  const toText = meta.to.map(addressText).join(" ")
  for (const t of q.to) if (!toText.includes(t)) return false
  for (const t of q.negTo) if (toText.includes(t)) return false
  if (q.toMe && !q.userAddresses.some((a) => toText.includes(a))) return false

  const ccText = meta.cc.map(addressText).join(" ")
  for (const c of q.cc) if (!ccText.includes(c)) return false

  if (q.with.length || q.withMe) {
    const anyAddr = (fromText + " " + toText + " " + ccText).toLowerCase()
    for (const w of q.with) if (!anyAddr.includes(w)) return false
    if (q.withMe && !q.userAddresses.some((a) => anyAddr.includes(a))) return false
  }

  const subj = (meta.subject ?? "").toLowerCase()
  for (const s of q.subject) if (!subj.includes(s)) return false
  for (const s of q.negSubject) if (subj.includes(s)) return false

  // Free text searches over subject + snippet. Body is not pre-indexed, so
  // searches without a date/account filter on a large store will be slow,
  // but that's the price of "no caching".
  if (q.text.length || q.negText.length) {
    const hay = (subj + " " + (meta.snippet ?? "")).toLowerCase()
    for (const t of q.text) if (!hay.includes(t)) return false
    for (const t of q.negText) if (hay.includes(t)) return false
  }
  return true
}

function addressText(a: { name: string | null; address: string } | null): string {
  if (!a) return ""
  return ((a.name ?? "") + " " + a.address).toLowerCase()
}

function tokenize(input: string): string[] {
  // Whitespace-separated, but preserve quoted strings.
  const out: string[] = []
  let buf = ""
  let inQuote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (inQuote) {
      if (c === inQuote) inQuote = null
      else buf += c
      continue
    }
    if (c === '"' || c === "'") {
      inQuote = c
      continue
    }
    if (/\s/.test(c)) {
      if (buf) {
        out.push(buf)
        buf = ""
      }
      continue
    }
    buf += c
  }
  if (buf) out.push(buf)
  return out
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseRelative(v: string): number | null {
  const m = v.match(/^(\d+)\s*([dwmy])$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  const day = 24 * 60 * 60 * 1000
  switch (unit) {
    case "d":
      return n * day
    case "w":
      return n * 7 * day
    case "m":
      return n * 30 * day
    case "y":
      return n * 365 * day
  }
  return null
}
