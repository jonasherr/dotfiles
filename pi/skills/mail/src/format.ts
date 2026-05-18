// Output formatting for the CLI. Default is a compact human-readable table
// suitable both for the user and for an agent to paste back. --json emits
// newline-delimited JSON.

import type { MessageFull, MessageMeta } from "./types.js"

export interface ListFormatOptions {
  json: boolean
  tsv?: boolean
  showMailbox?: boolean
}

export function formatList(items: MessageMeta[], opts: ListFormatOptions): string {
  if (opts.json) {
    return items.map((m) => JSON.stringify(m)).join("\n")
  }
  if (opts.tsv) {
    return formatTsv(items)
  }
  if (items.length === 0) return "(no messages)"
  const rows = items.map((m) => ({
    date: shortDate(m.date),
    flags: flagBadge(m),
    from: shortAddress(m.from?.name || m.from?.address || ""),
    subject: truncate(m.subject || "(no subject)", 70),
    account: m.account,
    mailbox: m.mailbox,
    id: m.id,
  }))
  const cols: Array<{ header: string; key: keyof (typeof rows)[number] }> = [
    { header: "DATE", key: "date" },
    { header: "F", key: "flags" },
    { header: "FROM", key: "from" },
    { header: "SUBJECT", key: "subject" },
  ]
  if (opts.showMailbox) {
    cols.push({ header: "ACCOUNT", key: "account" })
    cols.push({ header: "MAILBOX", key: "mailbox" })
  }
  const widths = cols.map((c) =>
    Math.min(60, Math.max(c.header.length, ...rows.map((r) => String(r[c.key]).length))),
  )
  const lines: string[] = []
  lines.push(cols.map((c, i) => c.header.padEnd(widths[i])).join("  "))
  lines.push(cols.map((_, i) => "-".repeat(widths[i])).join("  "))
  for (const r of rows) {
    lines.push(cols.map((c, i) => String(r[c.key]).padEnd(widths[i])).join("  "))
    lines.push(`  id: ${r.id}`)
  }
  return lines.join("\n")
}

export function formatMessage(m: MessageFull, opts: { json: boolean; body: boolean }): string {
  if (opts.json) return JSON.stringify(m)
  const lines: string[] = []
  lines.push(`Subject: ${m.subject || "(no subject)"}`)
  lines.push(`From:    ${formatAddress(m.from)}`)
  if (m.to.length) lines.push(`To:      ${m.to.map(formatAddress).join(", ")}`)
  if (m.cc.length) lines.push(`Cc:      ${m.cc.map(formatAddress).join(", ")}`)
  lines.push(`Date:    ${m.date}`)
  lines.push(`Account: ${m.account}`)
  lines.push(`Mailbox: ${m.mailbox}`)
  lines.push(`Flags:   ${flagsList(m).join(", ") || "(none)"}`)
  if (m.attachments.length) {
    lines.push(`Attachments:`)
    for (const a of m.attachments) {
      const size = a.size != null ? ` (${humanSize(a.size)})` : ""
      lines.push(`  - ${a.filename}${size}`)
      if (a.path) lines.push(`    path: ${a.path}`)
    }
  }
  lines.push(`Id:      ${m.id}`)
  lines.push("")
  if (opts.body) {
    lines.push(m.body || "(empty body)")
  } else {
    lines.push(`Snippet: ${m.snippet}`)
    lines.push("")
    lines.push("(use --body to show full message body, --raw for original RFC822)")
  }
  return lines.join("\n")
}

function formatAddress(a: { name: string | null; address: string } | null): string {
  if (!a) return ""
  return a.name ? `${a.name} <${a.address}>` : a.address
}

function formatTsv(items: MessageMeta[]): string {
  if (items.length === 0) return ""
  // Columns chosen for one-line agent consumption: id is last so grep/awk easy.
  const header = ["date", "flags", "from", "subject", "account", "mailbox", "id"].join("\t")
  const rows = items.map((m) => {
    const f = []
    if (!m.flags.read) f.push("unread")
    if (m.flags.flagged) f.push("flagged")
    if (m.flags.hasAttachment) f.push("attachment")
    return [
      m.date,
      f.join(","),
      sanitize((m.from?.name || m.from?.address || "").replace(/<.*?>/g, "").trim()),
      sanitize(m.subject || ""),
      m.account,
      m.mailbox,
      m.id,
    ].join("\t")
  })
  return [header, ...rows].join("\n")
}

function sanitize(s: string): string {
  // Strip control chars and collapse tabs/newlines so TSV stays one-row-per-message.
  return s.replace(/[\t\r\n]+/g, " ").trim()
}

function shortAddress(s: string): string {
  return truncate(s.replace(/<.*?>/g, "").trim() || s, 28)
}

function shortDate(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return sameYear ? `${mo}-${da} ${hh}:${mm}` : `${d.getFullYear()}-${mo}-${da}`
}

function flagBadge(m: MessageMeta): string {
  let s = ""
  s += m.flags.read ? " " : "•"
  s += m.flags.flagged ? "★" : " "
  s += m.flags.hasAttachment ? "@" : " "
  return s
}

function flagsList(m: MessageMeta): string[] {
  const out: string[] = []
  if (!m.flags.read) out.push("unread")
  if (m.flags.flagged) out.push("flagged")
  if (m.flags.answered) out.push("answered")
  if (m.flags.hasAttachment) out.push("attachment")
  if (m.flags.draft) out.push("draft")
  if (m.flags.deleted) out.push("deleted")
  return out
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + "…"
}

function humanSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}
