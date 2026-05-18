// Envelope Index backend.
//
// Mail.app maintains its own SQLite database at
// `~/Library/Mail/V<N>/MailData/Envelope Index` with normalized tables for
// messages, addresses, subjects, recipients, mailboxes, and attachments.
// We query it directly to pre-narrow candidates from O(30000-file walk)
// down to O(SQL-indexed-lookup) before we touch the filesystem.
//
// What it DOES give us (all indexed):
//   - sender / from address  -> messages.sender -> addresses
//   - to / cc recipients      -> recipients -> addresses
//   - subject substring       -> messages.subject -> subjects
//   - date_received           -> messages.date_received  (UNIX seconds)
//   - flags (read/flagged/answered/deleted/attachment) -> messages columns
//   - mailbox / account       -> mailboxes.url
//
// What it DOES NOT give us:
//   - Full-text body search. Modern macOS Mail no longer maintains FTS over
//     bodies in this DB (body indexing moved to CoreSpotlight, which itself
//     no longer indexes Mail on recent macOS). For free-text body queries
//     we still fall back to walking .emlx files.
//
// Schema is undocumented and may change between macOS releases. We probe
// the columns we use up-front and degrade gracefully (return null) so the
// CLI can fall back to the filesystem walker.

import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import type { Account, Mailbox } from "./types.js"
import type { ParsedQuery } from "./search.js"
import { findStorageRoot } from "./discover.js"

/** Path to a candidate message on disk. */
export interface EnvelopeHit {
  path: string
  account: string
  mailbox: string
  dateMs: number
}

interface EnvelopeContext {
  db: DatabaseSync
  /** Maps `mailboxes.ROWID` -> { account, mailboxName, mailboxPath, snapshotDir } */
  mailboxMap: Map<number, ResolvedMailbox>
}

interface ResolvedMailbox {
  account: string
  mailboxName: string
  mailboxPath: string // absolute filesystem path to the .mbox directory
  snapshotDir: string | null // the UUID subdir under .mbox/ that holds Data/
}

/** Open the Envelope Index read-only. Returns null when the DB is missing
 *  or unreadable (e.g. fresh Mail.app install, FDA missing, schema mismatch). */
export function openEnvelopeIndex(): DatabaseSync | null {
  const path = envelopeIndexPath()
  if (!path || !existsSync(path)) return null
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    // Smoke-test the columns we actually rely on. If Apple renames any of
    // these we bail out and let the caller fall back to the walker.
    db.prepare(
      "SELECT m.ROWID, m.sender, m.subject, m.date_received, m.flags, m.deleted, m.mailbox FROM messages m LIMIT 1",
    ).get()
    db.prepare("SELECT ROWID, address, comment FROM addresses LIMIT 1").get()
    db.prepare("SELECT ROWID, subject FROM subjects LIMIT 1").get()
    db.prepare("SELECT message, address, type FROM recipients LIMIT 1").get()
    db.prepare("SELECT ROWID, url FROM mailboxes LIMIT 1").get()
    return db
  } catch {
    return null
  }
}

function envelopeIndexPath(): string | null {
  try {
    const root = findStorageRoot()
    return join(root, "MailData", "Envelope Index")
  } catch {
    return null
  }
}

/** Translate a `mailboxes.url` from the Envelope DB into the on-disk Mailbox
 *  we resolved via `listMailboxes()`. URLs look like:
 *    imap://<ACCOUNT-UUID>/<percent-encoded-path>
 *    imap://<ACCOUNT-UUID>/<email>/<sub>/<folder>
 *    pop://<ACCOUNT-UUID>/INBOX
 *    local:///<name>            (On My Mac)
 *  We extract the account UUID and the path, match against the account's
 *  storage path, then match the mailbox-name path-suffix against
 *  Mailbox.name (already `/`-joined in discover.ts). */
function resolveMailboxUrl(
  url: string,
  accounts: Account[],
  mailboxes: Mailbox[],
): ResolvedMailbox | null {
  // local:/// or similar "On My Mac" URLs aren't tied to an account UUID; we
  // handle them only if the user has a single non-IMAP/POP account that
  // matches by mailbox name.
  const m = url.match(/^[a-z]+:\/\/([0-9A-F-]{8,})\/(.*)$/i)
  if (!m) return null
  const acctUuid = m[1]
  const pathPart = decodeURIComponent(m[2])
  // Strip "<username>/" prefix when present (some IMAP URLs include the user
  // name, e.g. "imap://UUID/user@host/Archive"). Mail.app stores those as
  // bare top-level mailboxes on disk ("Archive.mbox").
  const acct = accounts.find((a) => a.uuid === acctUuid)
  if (!acct) return null
  // Match Mailbox.name against either the full pathPart or the path with
  // the leading username segment stripped. Mail also separates path
  // components by "/" and percent-encodes the segments themselves, which
  // decodeURIComponent already handled above.
  const candidates = [pathPart]
  const firstSlash = pathPart.indexOf("/")
  if (firstSlash !== -1 && /@/.test(pathPart.slice(0, firstSlash))) {
    candidates.push(pathPart.slice(firstSlash + 1))
  }
  const myMboxes = mailboxes.filter((mb) => mb.account === acct.name)
  for (const cand of candidates) {
    const hit = myMboxes.find(
      (mb) => mb.name === cand || mb.name.toLowerCase() === cand.toLowerCase(),
    )
    if (hit) {
      return {
        account: acct.name,
        mailboxName: hit.name,
        mailboxPath: hit.path,
        snapshotDir: findSnapshotDir(hit.path),
      }
    }
  }
  return null
}

/** Each .mbox directory contains exactly one UUID-named subdirectory that
 *  holds the `Data/` tree. We cache it per mailbox path on first lookup. */
const snapshotDirCache = new Map<string, string | null>()
function findSnapshotDir(mailboxPath: string): string | null {
  const cached = snapshotDirCache.get(mailboxPath)
  if (cached !== undefined) return cached
  let result: string | null = null
  try {
    for (const entry of readdirSync(mailboxPath)) {
      const sub = join(mailboxPath, entry)
      if (!statSync(sub).isDirectory()) continue
      if (existsSync(join(sub, "Data"))) {
        result = entry
        break
      }
    }
  } catch {
    // ignore; result stays null
  }
  snapshotDirCache.set(mailboxPath, result)
  return result
}

/** Compute the `.emlx` path for a given message ROWID.
 *
 *  Mail's directory layout under `<MAILBOX>.mbox/<SNAPSHOT-UUID>/Data/` shards
 *  by individual digits of the ROWID. We've empirically verified that the
 *  shards are the thousands and ten-thousands digits, extended with more
 *  digit-positions for larger ROWIDs:
 *
 *    ROWID 41577  -> Data/1/4/Messages/41577.emlx
 *    ROWID 30618  -> Data/0/3/Messages/30618.emlx     (".partial.emlx" variant)
 *    ROWID 14552  -> Data/4/1/Messages/14552.emlx
 *
 *  A message may be stored as either `<rowid>.emlx` or `<rowid>.partial.emlx`
 *  (Mail downloads the body lazily for IMAP). We try both. */
export function emlxPathForRowid(
  mailboxPath: string,
  snapshotDir: string,
  rowid: number,
): string | null {
  const dirs: string[] = []
  for (let div = 1000; ; div *= 10) {
    const upper = Math.floor(rowid / div)
    if (upper <= 0 && dirs.length > 0) break
    if (upper === 0 && dirs.length === 0) {
      // ROWID < 1000: Mail still uses at least one shard ("0") at the
      // thousands level. Tested by inspection.
      dirs.push("0")
      break
    }
    dirs.push(String(upper % 10))
    if (upper < 10) break
  }
  const base = join(mailboxPath, snapshotDir, "Data", ...dirs, "Messages")
  const full = join(base, `${rowid}.emlx`)
  if (existsSync(full)) return full
  const partial = join(base, `${rowid}.partial.emlx`)
  if (existsSync(partial)) return partial
  return null
}

/** Build the WHERE clause + params for the structured portion of a query.
 *  Returns null when the query can't be fully expressed in SQL and the
 *  caller should fall back to the walker. We try to be conservative: any
 *  free-text term in q.text or q.negText forces a fallback unless the
 *  caller is happy to post-filter our SQL candidates. */
interface BuiltQuery {
  sql: string
  params: (string | number)[]
  /** True if the query has terms (free text, etc.) we couldn't translate
   *  and the caller MUST run the matcher on each parsed .emlx. */
  needsPostFilter: boolean
}

function buildEnvelopeQuery(
  q: ParsedQuery,
  mailboxRowids: number[],
): BuiltQuery {
  const where: string[] = ["m.deleted = 0"]
  const params: (string | number)[] = []
  let needsPostFilter = false

  // Mailbox-scope: restrict to the resolved on-disk mailbox set so we never
  // surface a row whose mailbox we can't translate to a filesystem path.
  if (mailboxRowids.length === 0) {
    // No mailboxes resolvable -> no rows. Force empty result.
    where.push("0")
  } else if (mailboxRowids.length === 1) {
    where.push("m.mailbox = ?")
    params.push(mailboxRowids[0])
  } else {
    where.push(`m.mailbox IN (${mailboxRowids.map(() => "?").join(",")})`)
    params.push(...mailboxRowids)
  }

  // Date filters. Envelope stores UNIX seconds.
  const dateLower = Math.max(q.newerThanMs ?? 0, q.afterMs ?? 0) || null
  const dateUpper = Math.min(
    q.olderThanMs ?? Number.MAX_SAFE_INTEGER,
    q.beforeMs ?? Number.MAX_SAFE_INTEGER,
  )
  if (dateLower !== null) {
    where.push("m.date_received >= ?")
    params.push(Math.floor(dateLower / 1000))
  }
  if (dateUpper !== Number.MAX_SAFE_INTEGER) {
    where.push("m.date_received <= ?")
    params.push(Math.floor(dateUpper / 1000))
  }

  // Flags.
  // Mail's `flags` column is a bitfield. We rely on the dedicated `read`
  // and `flagged` columns where possible.
  if (q.isUnread) where.push("m.read = 0")
  if (q.isRead) where.push("m.read = 1")
  if (q.isFlagged) where.push("m.flagged = 1")
  if (q.isAnswered) {
    // bit 0 in m.flags is "answered" per Mail.app convention (empirically:
    // flag value 8589934592 = bit 33 doesn't apply here; the low bit varies).
    // We accept either answered-flag bit and verify on post-filter.
    needsPostFilter = true
  }
  if (q.hasAttachment) {
    where.push("EXISTS (SELECT 1 FROM attachments att WHERE att.message = m.ROWID)")
  }

  // From / sender (joined to addresses via messages.sender).
  for (const f of q.from) {
    where.push(
      "(SELECT (a.address LIKE ? OR a.comment LIKE ?) FROM addresses a WHERE a.ROWID = m.sender)",
    )
    params.push(`%${f}%`, `%${f}%`)
  }
  for (const nf of q.negFrom) {
    where.push(
      "NOT EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND (a.address LIKE ? OR a.comment LIKE ?))",
    )
    params.push(`%${nf}%`, `%${nf}%`)
  }
  // from:me / -from:me - expand `me` to any of the user's own addresses via
  // an OR clause so we don't substring-match the literal letters "me".
  if (q.fromMe && q.userAddresses.length > 0) {
    const ors = q.userAddresses.map(
      () => "EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND a.address LIKE ?)",
    )
    where.push(`(${ors.join(" OR ")})`)
    for (const a of q.userAddresses) params.push(`%${a}%`)
  }
  if (q.negFromMe && q.userAddresses.length > 0) {
    const nots = q.userAddresses.map(
      () => "NOT EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND a.address LIKE ?)",
    )
    where.push(`(${nots.join(" AND ")})`)
    for (const a of q.userAddresses) params.push(`%${a}%`)
  }

  // To / Cc (joined via recipients table). type=0 is To, type=1 is Cc.
  for (const t of q.to) {
    where.push(
      "EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND r.type = 0 AND (a.address LIKE ? OR a.comment LIKE ?))",
    )
    params.push(`%${t}%`, `%${t}%`)
  }
  for (const nt of q.negTo) {
    where.push(
      "NOT EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND r.type = 0 AND (a.address LIKE ? OR a.comment LIKE ?))",
    )
    params.push(`%${nt}%`, `%${nt}%`)
  }
  if (q.toMe && q.userAddresses.length > 0) {
    const ors = q.userAddresses.map(
      () =>
        "EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND r.type = 0 AND a.address LIKE ?)",
    )
    where.push(`(${ors.join(" OR ")})`)
    for (const a of q.userAddresses) params.push(`%${a}%`)
  }
  for (const c of q.cc) {
    where.push(
      "EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND r.type = 1 AND (a.address LIKE ? OR a.comment LIKE ?))",
    )
    params.push(`%${c}%`, `%${c}%`)
  }

  // `with:` / correspondent: any of sender / to / cc.
  for (const w of q.with) {
    where.push(`(
      EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND (a.address LIKE ? OR a.comment LIKE ?))
      OR EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND (a.address LIKE ? OR a.comment LIKE ?))
    )`)
    params.push(`%${w}%`, `%${w}%`, `%${w}%`, `%${w}%`)
  }
  if (q.withMe && q.userAddresses.length > 0) {
    const ors = q.userAddresses.map(
      () => `(
        EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND a.address LIKE ?)
        OR EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND a.address LIKE ?)
      )`,
    )
    where.push(`(${ors.join(" OR ")})`)
    for (const a of q.userAddresses) params.push(`%${a}%`, `%${a}%`)
  }

  // Subject.
  for (const s of q.subject) {
    where.push("EXISTS (SELECT 1 FROM subjects sj WHERE sj.ROWID = m.subject AND sj.subject LIKE ?)")
    params.push(`%${s}%`)
  }
  for (const ns of q.negSubject) {
    where.push("NOT EXISTS (SELECT 1 FROM subjects sj WHERE sj.ROWID = m.subject AND sj.subject LIKE ?)")
    params.push(`%${ns}%`)
  }

  // Free-text terms: Envelope doesn't index bodies on modern macOS, so we
  // can't translate these. Match them against subject + sender as a best-
  // effort pre-narrow, then require post-filter so the matcher checks the
  // actual body (parsed from .emlx) for an authoritative answer.
  for (const tx of q.text) {
    where.push(`(
      EXISTS (SELECT 1 FROM subjects sj WHERE sj.ROWID = m.subject AND sj.subject LIKE ?)
      OR EXISTS (SELECT 1 FROM addresses a WHERE a.ROWID = m.sender AND (a.address LIKE ? OR a.comment LIKE ?))
      OR EXISTS (SELECT 1 FROM recipients r JOIN addresses a ON r.address = a.ROWID WHERE r.message = m.ROWID AND (a.address LIKE ? OR a.comment LIKE ?))
    )`)
    params.push(`%${tx}%`, `%${tx}%`, `%${tx}%`, `%${tx}%`, `%${tx}%`)
    needsPostFilter = true
  }
  for (const _nt of q.negText) {
    // Negative free-text: we'd have to scan the body to be sure. Just
    // post-filter without narrowing.
    needsPostFilter = true
  }

  // q.isAnswered → already flagged needsPostFilter above.

  const sql = `
    SELECT m.ROWID AS rowid, m.mailbox AS mailbox_rowid, m.date_received AS date_received
    FROM messages m
    WHERE ${where.join(" AND ")}
    ORDER BY m.date_received DESC
  `
  return { sql, params, needsPostFilter }
}

export interface EnvelopeSearchResult {
  hits: EnvelopeHit[]
  /** When true, the caller must apply the full matcher to each hit because
   *  some operators couldn't be translated to SQL. */
  needsPostFilter: boolean
}

/** Run an Envelope-Index-backed search. Returns `null` to signal that the
 *  caller should fall back to the filesystem walker. */
export function envelopeSearch(
  q: ParsedQuery,
  opts: {
    accounts: Account[]
    mailboxes: Mailbox[]
    limit: number
  },
): EnvelopeSearchResult | null {
  const db = openEnvelopeIndex()
  if (!db) return null
  try {
    // Resolve every mailbox URL we can to an on-disk path so we know which
    // mailbox ROWIDs to constrain by.
    const ctx: EnvelopeContext = { db, mailboxMap: new Map() }
    const urlRows = db
      .prepare("SELECT ROWID, url FROM mailboxes")
      .all() as { ROWID: number; url: string }[]
    const mailboxRowids: number[] = []
    for (const r of urlRows) {
      const resolved = resolveMailboxUrl(r.url, opts.accounts, opts.mailboxes)
      if (!resolved) continue
      ctx.mailboxMap.set(r.ROWID, resolved)
      mailboxRowids.push(r.ROWID)
    }

    const built = buildEnvelopeQuery(q, mailboxRowids)
    // Cap candidates conservatively: we still need to parse each .emlx, so
    // pulling 100K rows would defeat the purpose. Allow up to 20x the
    // requested limit so the matcher has room to reject some.
    const stmt: StatementSync = db.prepare(
      built.sql + " LIMIT ?",
    )
    const rows = stmt.all(...built.params, Math.max(opts.limit * 20, 200)) as {
      rowid: number
      mailbox_rowid: number
      date_received: number
    }[]

    const hits: EnvelopeHit[] = []
    for (const row of rows) {
      const mb = ctx.mailboxMap.get(row.mailbox_rowid)
      if (!mb || !mb.snapshotDir) continue
      const path = emlxPathForRowid(mb.mailboxPath, mb.snapshotDir, row.rowid)
      if (!path) continue
      hits.push({
        path,
        account: mb.account,
        mailbox: mb.mailboxName,
        dateMs: row.date_received * 1000,
      })
    }
    return { hits, needsPostFilter: built.needsPostFilter }
  } finally {
    db.close()
  }
}

/** Tiny helper for the CLI doctor: returns a status string. */
export function envelopeStatus(): string {
  const path = envelopeIndexPath()
  if (!path) return "(storage root not found)"
  if (!existsSync(path)) return "(not present)"
  const db = openEnvelopeIndex()
  if (!db) return "✗ unreadable (schema mismatch or permissions)"
  try {
    const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE deleted=0").get() as
      | { n: number }
      | undefined
    return `✓ ok (${row?.n ?? "?"} messages indexed)`
  } catch (err) {
    return `✗ ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`
  } finally {
    db.close()
  }
}


