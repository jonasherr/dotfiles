// Find Mail.app's storage directory, the configured accounts, and their
// mailboxes.

import { readdirSync, statSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Account, Mailbox } from "./types.js"
import { plutilJson } from "./plist.js"

/** Mailboxes excluded from default search results in both backends. */
export const SKIP_MAILBOX_PATTERNS: RegExp[] = [
  /^trash$/i,
  /^papierkorb$/i,
  /^deleted messages$/i,
  /^gel(oe|\u00f6)schte (nachrichten|objekte)$/i,
  /^deleted items?$/i,
  /(^|\/)trash$/i, // e.g. [Gmail]/Trash
  /^spam$/i,
  /^junk$/i,
  /^junk-?e-?mail$/i,
  /(^|\/)spam$/i,
  /(^|\/)junk$/i,
  /^bin$/i,
  /^drafts$/i,
  /^entw(ue|\u00fc)rfe$/i,
  /(^|\/)drafts$/i,
]

const MAIL_ROOT = process.env.MAIL_ROOT || join(homedir(), "Library", "Mail")

// UUID regex for account/mailbox directories.
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i

/** Return the active versioned storage directory (e.g. ~/Library/Mail/V10). */
export function findStorageRoot(): string {
  if (!existsSync(MAIL_ROOT)) {
    throw new MailError(
      `${MAIL_ROOT} does not exist. Has Mail.app ever been launched on this Mac?`,
    )
  }
  let entries: string[]
  try {
    entries = readdirSync(MAIL_ROOT)
  } catch (err: any) {
    if (err?.code === "EPERM" || err?.code === "EACCES") {
      throw new MailError(
        `Cannot read ${MAIL_ROOT}: ${err.code}. The terminal/agent process needs Full Disk Access. Grant it in System Settings → Privacy & Security → Full Disk Access.`,
      )
    }
    throw err
  }
  const versions = entries
    .filter((e) => /^V\d+$/.test(e))
    .map((e) => ({ name: e, n: parseInt(e.slice(1), 10) }))
    .sort((a, b) => b.n - a.n)
  if (versions.length === 0) {
    throw new MailError(
      `No Mail.app storage version directory (V<N>) found under ${MAIL_ROOT}.`,
    )
  }
  return join(MAIL_ROOT, versions[0].name)
}

/**
 * Read AccountsMap.plist: maps each Mail-storage UUID to the IMAP/POP URL that
 * Mail.app uses internally. We extract the email from the URL so we can join
 * to the unified Accounts database for a friendly name.
 */
interface AccountsMapEntry {
  url: string
  email: string | null
}
function readAccountsMap(root: string): Map<string, AccountsMapEntry> {
  const out = new Map<string, AccountsMapEntry>()
  const path = join(root, "MailData", "Signatures", "AccountsMap.plist")
  const data = plutilJson<Record<string, { AccountURL?: string }>>(path)
  if (!data) return out
  for (const [uuid, entry] of Object.entries(data)) {
    const url = entry?.AccountURL ?? ""
    let email: string | null = null
    // e.g. imap://user.name%40example.com/ → user.name@example.com
    const m = url.match(/^[a-z]+:\/\/([^/?]+)/i)
    if (m) {
      try {
        const userinfo = decodeURIComponent(m[1])
        // strip optional :password
        email = userinfo.split(":")[0]
      } catch {
        email = null
      }
    }
    out.set(uuid, { url, email })
  }
  return out
}

/**
 * Query macOS's unified Accounts4.sqlite for friendly description + username
 * keyed by username (email). Read-only; if sqlite3 fails we just get empty.
 */
interface SystemAccount {
  identifier: string
  username: string
  description: string | null
  type: string
}
function readSystemAccounts(): SystemAccount[] {
  const dbPath = join(homedir(), "Library", "Accounts", "Accounts4.sqlite")
  if (!existsSync(dbPath)) return []
  // Only top-level rows: Accounts4 stores Mail/Calendar/Contacts/etc. as
  // child rows under each parent account, and only the parent carries the
  // user's friendly label ("Personal", "Work", "iCloud", etc.). Filter to those.
  const sql =
    "SELECT IFNULL(a.ZIDENTIFIER,''), IFNULL(t.ZACCOUNTTYPEDESCRIPTION,''), " +
    "IFNULL(a.ZUSERNAME,''), IFNULL(a.ZACCOUNTDESCRIPTION,'') " +
    "FROM ZACCOUNT a JOIN ZACCOUNTTYPE t ON a.ZACCOUNTTYPE = t.Z_PK " +
    "WHERE a.ZPARENTACCOUNT IS NULL"
  const res = spawnSync("/usr/bin/sqlite3", ["-readonly", "-separator", "\u001e", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  })
  if (res.status !== 0 || !res.stdout) return []
  const out: SystemAccount[] = []
  for (const line of res.stdout.split("\n")) {
    if (!line) continue
    const [identifier, type, username, description] = line.split("\u001e")
    out.push({ identifier, type, username, description: description || null })
  }
  return out
}

/**
 * Pick the most useful description for a row: a real label like "Personal" or
 * "iCloud" beats a row whose description is just the email address or empty.
 */
function descScore(sa: SystemAccount): number {
  if (!sa.description) return 0
  if (sa.description.trim() === sa.username.trim()) return 1
  return 2
}

export function listAccounts(): Account[] {
  const root = findStorageRoot()
  const entries = safeReaddir(root)
  const accountsMap = readAccountsMap(root)
  const systemAccounts = readSystemAccounts()
  // Index system accounts by both UUID (for local-only accounts like "On My
  // Mac" that have no username) and by username (for IMAP/Gmail/iCloud).
  // For username collisions, pick the row with the best descriptor: a
  // friendly label ("iCloud") beats a row whose description equals the
  // username, which beats no description at all.
  const byUuid = new Map<string, SystemAccount>()
  const byUsername = new Map<string, SystemAccount>()
  for (const sa of systemAccounts) {
    if (sa.identifier) byUuid.set(sa.identifier, sa)
    if (!sa.username) continue
    const key = sa.username.toLowerCase()
    const prev = byUsername.get(key)
    if (!prev || descScore(sa) > descScore(prev)) {
      byUsername.set(key, sa)
    }
  }

  const accounts: Account[] = []
  for (const entry of entries) {
    if (!UUID_RE.test(entry)) continue
    const accountDir = join(root, entry)
    const mapEntry = accountsMap.get(entry)
    const email = mapEntry?.email ?? null
    // Resolve a friendly name via two paths: direct UUID match (for local
    // accounts like "On My Mac"), then by username/email join.
    const sysByUuid = byUuid.get(entry)
    const sysByEmail = email ? byUsername.get(email.toLowerCase()) : undefined
    const desc =
      (sysByUuid && descScore(sysByUuid) >= 2 && sysByUuid.description) ||
      (sysByEmail && descScore(sysByEmail) >= 2 && sysByEmail.description) ||
      (sysByEmail?.description ?? null) ||
      (sysByUuid?.description ?? null)
    const name = desc?.trim() || email || entry
    const emails = email ? [email] : []
    accounts.push({
      uuid: entry,
      name,
      emailAddresses: emails,
      storagePath: accountDir,
    })
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name))
}

/** Find mailbox (.mbox) directories under an account, recursively. */
export function listMailboxes(account: Account): Mailbox[] {
  const out: Mailbox[] = []
  walkMboxes(account.storagePath, account.name, out)
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function walkMboxes(dir: string, accountName: string, out: Mailbox[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue
    if (entry.endsWith(".mbox")) {
      const niceName = mboxName(full)
      out.push({ account: accountName, name: niceName, path: full })
      // Mail.app nests sub-mailboxes inside `.mbox` directories too.
      walkMboxes(full, accountName, out)
    } else if (UUID_RE.test(entry)) {
      // Skip per-mailbox UUID storage directories.
      continue
    } else if (entry === "Data" || entry === "MailData" || entry === "Mailboxes") {
      // Skip non-mailbox internal dirs.
      continue
    } else {
      walkMboxes(full, accountName, out)
    }
  }
}

/**
 * Derive a human-friendly mailbox name from a .mbox path. We strip the
 * `.mbox` suffix and join nested parts with `/` so a Gmail mailbox at
 * `<account>/[Gmail].mbox/All Mail.mbox` becomes `[Gmail]/All Mail`.
 */
function mboxName(mboxPath: string): string {
  const parts: string[] = []
  let cur = mboxPath
  while (cur.endsWith(".mbox")) {
    const base = cur.slice(cur.lastIndexOf("/") + 1, -".mbox".length)
    parts.unshift(base)
    const parent = cur.slice(0, cur.lastIndexOf("/"))
    if (!parent.endsWith(".mbox")) break
    cur = parent
  }
  return parts.join("/")
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch (err: any) {
    if (err?.code === "EPERM" || err?.code === "EACCES") {
      throw new MailError(
        `Cannot read ${dir}: ${err.code}. Grant Full Disk Access to this terminal.`,
      )
    }
    throw err
  }
}

export class MailError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = "MailError"
  }
}
