#!/usr/bin/env -S npx tsx
// `inbox` CLI entry point. Read-only access to Mail.app's local store.
//
// One backend: parses .emlx files under ~/Library/Mail/. Requires Full Disk
// Access on the terminal binary. If FDA is missing the CLI prints a clear
// error pointing the user at System Settings.

import { readFileSync, existsSync } from "node:fs"
import {
  listAccounts,
  listMailboxes,
  MailError,
  SKIP_MAILBOX_PATTERNS,
} from "./discover.js"
import type { Account, Mailbox, MessageMeta } from "./types.js"
import { walkMailbox } from "./walk.js"
import { parseEmlxFile } from "./emlx.js"
import { parseQuery, matches } from "./search.js"
import { formatList, formatMessage } from "./format.js"
import { decodeId } from "./id.js"
import { dedupeByMessageId } from "./dedupe.js"
import { envelopeSearch, envelopeStatus } from "./envelope.js"

const args = process.argv.slice(2)

function usage(): string {
  return `inbox — read-only access to Mail.app's local store

USAGE
  inbox accounts                              List configured accounts
  inbox mailboxes [--account NAME]            List mailboxes/folders
  inbox list [OPTIONS]                        Recent messages, newest first
  inbox search "QUERY" [OPTIONS]              Gmail-style search
  inbox show <id> [--body] [--raw]            Show one message
  inbox thread <id> [--json]                  Show all messages in a thread
  inbox doctor                                Health check (FDA, storage)

GLOBAL OPTIONS
  --json                                     Emit NDJSON (one object per line)
  --tsv                                      Emit tab-separated rows (compact, agent-friendly)
  -n, --limit N                              Cap results (default: 20)
  --account NAME                             Restrict to a single account
  --mailbox NAME                             Restrict to a single mailbox
  --unread                                   Shortcut for is:unread
  --since DURATION                           e.g. 7d, 2w, 1m (shortcut for newer_than:)

SEARCH OPERATORS
  from:foo  to:foo  cc:foo  subject:"foo bar"
  with:foo                                   Matches any of from/to/cc (all correspondence)
  is:unread  is:read  is:flagged  is:answered
  has:attachment
  newer_than:7d  older_than:30d
  after:YYYY-MM-DD  before:YYYY-MM-DD
  account:NAME  in:MAILBOX
  -term                                      Negate
`
}

async function main(): Promise<void> {
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(usage())
    return
  }
  const cmd = args[0]
  const rest = args.slice(1)
  switch (cmd) {
    case "accounts":
      return cmdAccounts(rest)
    case "mailboxes":
      return cmdMailboxes(rest)
    case "list":
      return cmdList(rest)
    case "search":
      return cmdSearch(rest)
    case "show":
      return cmdShow(rest)
    case "thread":
      return cmdThread(rest)
    case "doctor":
      return cmdDoctor(rest)
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n`)
      process.stderr.write(usage())
      process.exit(2)
  }
}

// --- arg helpers -----------------------------------------------------------

interface CommonFlags {
  json: boolean
  tsv: boolean
  limit: number
  account: string | null
  mailbox: string | null
  unread: boolean
  since: string | null
  body: boolean
  raw: boolean
  positional: string[]
}

function parseFlags(args: string[]): CommonFlags {
  const out: CommonFlags = {
    json: false,
    tsv: false,
    limit: 20,
    account: null,
    mailbox: null,
    unread: false,
    since: null,
    body: false,
    raw: false,
    positional: [],
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    switch (a) {
      case "--json":
        out.json = true
        break
      case "--tsv":
        out.tsv = true
        break
      case "-n":
      case "--limit":
        out.limit = parseInt(args[++i] ?? "20", 10)
        break
      case "--account":
        out.account = args[++i] ?? null
        break
      case "--mailbox":
        out.mailbox = args[++i] ?? null
        break
      case "--unread":
        out.unread = true
        break
      case "--since":
        out.since = args[++i] ?? null
        break
      case "--body":
        out.body = true
        break
      case "--raw":
        out.raw = true
        break
      default:
        out.positional.push(a)
    }
  }
  return out
}

// --- commands --------------------------------------------------------------

function cmdAccounts(args: string[]): void {
  const flags = parseFlags(args)
  const accounts = listAccounts()
  if (flags.json) {
    for (const a of accounts) process.stdout.write(JSON.stringify(a) + "\n")
    return
  }
  if (accounts.length === 0) {
    process.stdout.write("(no accounts found)\n")
    return
  }
  for (const a of accounts) {
    process.stdout.write(`${a.name}  ${a.emailAddresses.join(", ")}\n`)
  }
}

function cmdMailboxes(args: string[]): void {
  const flags = parseFlags(args)
  const accountsAll = listAccounts()
  const accounts = flags.account
    ? accountsAll.filter((a) => a.name.toLowerCase() === flags.account!.toLowerCase())
    : accountsAll
  const rows: { account: string; name: string; path: string }[] = []
  for (const a of accounts) {
    for (const mb of listMailboxes(a)) {
      rows.push({ account: a.name, name: mb.name, path: mb.path })
    }
  }
  if (flags.json) {
    for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n")
    return
  }
  if (rows.length === 0) {
    process.stdout.write("(no mailboxes found)\n")
    return
  }
  const accW = Math.max(7, ...rows.map((r) => r.account.length))
  for (const r of rows) {
    process.stdout.write(`${r.account.padEnd(accW)}  ${r.name}\n`)
  }
}

function cmdList(args: string[]): void {
  const flags = parseFlags(args)
  // Build a query from --unread / --since / --account / --mailbox.
  const qParts: string[] = []
  if (flags.unread) qParts.push("is:unread")
  if (flags.since) qParts.push(`newer_than:${flags.since}`)
  if (flags.account) qParts.push(`account:${quote(flags.account)}`)
  if (flags.mailbox) qParts.push(`in:${quote(flags.mailbox)}`)
  runSearch(qParts.join(" "), flags)
}

function cmdSearch(args: string[]): void {
  const flags = parseFlags(args)
  const query = flags.positional.join(" ")
  if (!query.trim()) {
    process.stderr.write("search: query is required\n")
    process.exit(2)
  }
  // Allow --account / --mailbox / --unread / --since to augment the query.
  const extra: string[] = []
  if (flags.unread) extra.push("is:unread")
  if (flags.since) extra.push(`newer_than:${flags.since}`)
  if (flags.account) extra.push(`account:${quote(flags.account)}`)
  if (flags.mailbox) extra.push(`in:${quote(flags.mailbox)}`)
  runSearch([query, ...extra].join(" "), flags)
}

function runSearch(rawQuery: string, flags: CommonFlags): void {
  const q = parseQuery(rawQuery)
  const accounts = filteredAccounts(q.account ?? flags.account)
  // Populate the user's own addresses so `from:me` / `to:me` / `with:me`
  // expand to a real OR over each address rather than substring-matching
  // the literal letters "me". When the query is scoped with `account:`, we
  // only inject that account's addresses; otherwise we inject every
  // account's so cross-account sent messages still match.
  q.userAddresses = accounts
    .flatMap((a) => a.emailAddresses)
    .map((a) => a.toLowerCase())
    .filter(Boolean)
  for (const w of q.warnings) {
    process.stderr.write(`warning: ${w}\n`)
  }
  if ((q.fromMe || q.toMe || q.withMe || q.negFromMe) && q.userAddresses.length === 0) {
    process.stderr.write(
      "warning: 'me' was used in the query but no email addresses are configured for the selected account(s); the clause will not match anything.\n",
    )
  }
  const mailboxes: Mailbox[] = []
  for (const a of accounts) {
    for (const mb of listMailboxes(a)) {
      if (q.mailbox) {
        if (!mb.name.toLowerCase().includes(q.mailbox.toLowerCase())) continue
      } else {
        // Skip trash/spam/drafts/etc. by default; opt back in with in:trash.
        if (SKIP_MAILBOX_PATTERNS.some((re) => re.test(mb.name))) continue
      }
      mailboxes.push(mb)
    }
  }

  const results: MessageMeta[] = []

  // Fast path: query the Envelope Index for candidate messages. SQL with
  // indexed columns is O(ms) where the filesystem walk is O(seconds). We
  // still parse each .emlx for full headers / body / dedupe metadata.
  const envelope =
    process.env.INBOX_NO_ENVELOPE === "1"
      ? null
      : envelopeSearch(q, { accounts, mailboxes, limit: flags.limit })
  if (envelope && envelope.hits.length > 0) {
    for (const hit of envelope.hits) {
      let meta
      try {
        meta = parseEmlxFile(hit.path, { accountName: hit.account, mailboxName: hit.mailbox })
      } catch {
        continue
      }
      if (meta.flags.deleted) continue
      // Always apply the matcher: even when needsPostFilter is false, our
      // SQL is best-effort and the matcher is the source of truth.
      if (!matches(meta, q)) continue
      results.push(meta)
      if (results.length >= flags.limit * 10) break
    }
  } else if (envelope && !envelope.needsPostFilter) {
    // Envelope said it has a complete answer and that answer is empty.
    // Don't walk.
  } else {
    // No envelope (Mail.app not installed yet, schema mismatch, or query
    // needs a body walk we didn't try via SQL).
    for (const mb of mailboxes) {
      for (const f of walkMailbox(mb, {
        newerThanMs: q.newerThanMs ?? q.afterMs ?? undefined,
        olderThanMs: q.olderThanMs ?? q.beforeMs ?? undefined,
      })) {
        let meta
        try {
          meta = parseEmlxFile(f.path, { accountName: mb.account, mailboxName: mb.name })
        } catch {
          continue
        }
        if (meta.flags.deleted) continue
        if (!matches(meta, q)) continue
        results.push(meta)
        if (results.length >= flags.limit * mailboxes.length) break
      }
    }
  }
  // Dedupe (Gmail labels mirror messages across folders), then sort by date.
  const deduped = dedupeByMessageId(results)
  deduped.sort((a, b) => b.dateMs - a.dateMs)
  const top = deduped.slice(0, flags.limit)
  process.stdout.write(
    formatList(top, { json: flags.json, tsv: flags.tsv, showMailbox: mailboxes.length > 1 }) + "\n",
  )
}

function cmdShow(args: string[]): void {
  const flags = parseFlags(args)
  const id = flags.positional[0]
  if (!id) {
    process.stderr.write("show: <id> is required\n")
    process.exit(2)
  }
  const path = decodeId(id)
  if (!existsSync(path)) {
    process.stderr.write(`show: no such message: ${path}\n`)
    process.exit(1)
  }
  if (flags.raw) {
    const buf = readFileSync(path)
    const nl = buf.indexOf(0x0a)
    if (nl !== -1) {
      const head = buf.slice(0, nl).toString("ascii").trim()
      const len = /^\d+$/.test(head) ? parseInt(head, 10) : NaN
      if (!Number.isNaN(len) && nl + 1 + len <= buf.length) {
        process.stdout.write(buf.slice(nl + 1, nl + 1 + len))
        return
      }
    }
    process.stdout.write(buf)
    return
  }
  const { account, mailbox } = guessAccountMailboxFromPath(path)
  const m = parseEmlxFile(path, { accountName: account, mailboxName: mailbox })
  process.stdout.write(formatMessage(m, { json: flags.json, body: flags.body }) + "\n")
}

function cmdThread(args: string[]): void {
  const flags = parseFlags(args)
  const id = flags.positional[0]
  if (!id) {
    process.stderr.write("thread: <id> is required\n")
    process.exit(2)
  }
  const path = decodeId(id)
  if (!existsSync(path)) {
    process.stderr.write(`thread: no such message: ${path}\n`)
    process.exit(1)
  }
  const { account, mailbox } = guessAccountMailboxFromPath(path)
  const seed = parseEmlxFile(path, { accountName: account, mailboxName: mailbox })

  // A message is "in the thread" if it shares Message-ID/In-Reply-To/References
  // OR shares a normalized subject. We walk the same account.
  const known = new Set<string>()
  if (seed.messageId) known.add(seed.messageId)
  if (seed.inReplyTo) known.add(seed.inReplyTo)
  for (const r of seed.references) known.add(r)
  const subjKey = normalizeSubject(seed.subject)

  const accounts = listAccounts().filter((a) => a.name === seed.account)
  const results: MessageMeta[] = [seed]
  const seen = new Set<string>([seed.id])
  for (const a of accounts) {
    for (const mb of listMailboxes(a)) {
      for (const f of walkMailbox(mb)) {
        let meta
        try {
          meta = parseEmlxFile(f.path, { accountName: mb.account, mailboxName: mb.name })
        } catch {
          continue
        }
        if (seen.has(meta.id)) continue
        const refs = new Set<string>()
        if (meta.messageId) refs.add(meta.messageId)
        if (meta.inReplyTo) refs.add(meta.inReplyTo)
        for (const r of meta.references) refs.add(r)
        const idMatch = [...refs].some((r) => known.has(r))
        const subjMatch = normalizeSubject(meta.subject) === subjKey
        if (idMatch || subjMatch) {
          results.push(meta)
          seen.add(meta.id)
          if (meta.messageId) known.add(meta.messageId)
        }
      }
    }
  }
  // Dedupe Gmail label mirrors here too, then chronological order.
  const deduped = dedupeByMessageId(results)
  deduped.sort((a, b) => a.dateMs - b.dateMs)
  process.stdout.write(
    formatList(deduped, { json: flags.json, tsv: flags.tsv, showMailbox: true }) + "\n",
  )
}

function cmdDoctor(_args: string[]): void {
  const lines: string[] = []
  try {
    const accs = listAccounts()
    lines.push(`storage   ✓ ok (${accs.length} accounts)`)
    for (const a of accs) {
      lines.push(`          - ${a.name}${a.emailAddresses.length ? "  " + a.emailAddresses.join(", ") : ""}`)
    }
    lines.push(`envelope  ${envelopeStatus()}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Full Disk Access|EPERM|EACCES/.test(msg)) {
      lines.push(`storage   ✗ no Full Disk Access`)
      lines.push(``)
      lines.push(`Grant FDA to your terminal binary (Kitty / Terminal.app / iTerm) in`)
      lines.push(`System Settings → Privacy & Security → Full Disk Access, then RESTART`)
      lines.push(`the terminal app (not just the window). macOS treats /Applications/kitty.app`)
      lines.push(`and /Applications/Kitty.app as different apps — grant whichever launched`)
      lines.push(`this shell.`)
    } else {
      lines.push(`storage   ✗ ${msg.split("\n")[0]}`)
    }
  }
  process.stdout.write(lines.join("\n") + "\n")
}

// --- helpers ---------------------------------------------------------------

function filteredAccounts(name: string | null): Account[] {
  const all = listAccounts()
  if (!name) return all
  return all.filter((a) => a.name.toLowerCase() === name.toLowerCase())
}

function quote(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s
}

function normalizeSubject(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(re|fwd|fw|aw|tr)\s*:\s*/i, "")
    .replace(/^(re|fwd|fw|aw|tr)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function guessAccountMailboxFromPath(p: string): { account: string; mailbox: string } {
  // Longest-prefix mailbox match so messages are attributed to the most
  // specific mailbox (e.g. [Gmail]/All Mail, not the [Gmail] container).
  for (const a of listAccounts()) {
    if (!p.startsWith(a.storagePath + "/")) continue
    let best: { name: string; pathLen: number } | null = null
    for (const mb of listMailboxes(a)) {
      if (!p.startsWith(mb.path + "/")) continue
      if (!best || mb.path.length > best.pathLen) {
        best = { name: mb.name, pathLen: mb.path.length }
      }
    }
    return { account: a.name, mailbox: best?.name ?? "" }
  }
  return { account: "", mailbox: "" }
}

main().catch((err) => {
  if (err instanceof MailError) {
    process.stderr.write(`error: ${err.message}\n`)
    process.exit(1)
  }
  process.stderr.write(`error: ${err?.stack ?? err}\n`)
  process.exit(1)
})
