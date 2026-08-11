---
name: mail
description: Read email from the local macOS Mail.app store. Use when asked to "read my email", "check my inbox", "search my email", "what did X email me", "summarize unread", "find the email about Y", "show unread today", or anything else that requires looking at mail. Read-only. Works across all accounts Mail.app is configured with.
---

# Mail

Read-only access to the user's email by parsing `.emlx` files under `~/Library/Mail/V<N>/`. No API, no OAuth, no IMAP. Mail.app does the syncing; we read what it has cached on disk.

## When to use

- "Did anyone email me about X?" → `inbox search "to:me X"`
- "Summarize my unread." → `inbox list --unread`
- "Pull the latest email from $vendor." → `inbox search "from:vendor newer_than:7d"`
- "Find the thread where we discussed Y." → `inbox search "Y"` then `inbox thread <id>`
- "Show me what I sent today." → `inbox search "from:me newer_than:1d"`

Do **not** use this skill to send, reply, archive, label, or modify anything. It is read-only by design.

## Prerequisites

- Mail.app must be configured with the relevant accounts (it does the IMAP/Gmail/iCloud syncing for us).
- The terminal binary running `inbox` needs **Full Disk Access**. Grant it in **System Settings → Privacy & Security → Full Disk Access**, then **restart the terminal app** (not just the window).
- macOS treats `/Applications/kitty.app` and `/Applications/Kitty.app` as different apps. Grant FDA to whichever bundle launched the active shell.

Run `inbox doctor` to confirm storage access and see which accounts are visible.

## CLI

```
~/.pi/agent/skills/mail/bin/inbox <subcommand> ...
```

There is intentionally **no** PATH symlink. The agent invokes it by the full skill path. Quick reference:

```
inbox accounts                                # list accounts Mail.app knows about
inbox mailboxes [--account NAME]              # list mailboxes/folders
inbox list [-n 20] [--unread] [--account X]   # recent messages, newest first
inbox search "QUERY" [-n 20]                  # Gmail-style search (see below)
inbox show <id> [--body] [--raw]              # show full message
inbox thread <id>                             # show all messages in the thread
inbox doctor                                  # health check
```

Output formats:

- Default: compact human-readable table (the agent can also paste this back to the user).
- `--json`: NDJSON, one object per line. Use when the agent needs structured data.
- `--tsv`: tab-separated rows, one message per line. Most compact format; best for `grep`/`awk` style pipelines.

### Search query operators

`inbox search` accepts a subset of Gmail's search syntax:

- `from:foo` / `to:foo` / `cc:foo` — substring match against the address or display name
- `subject:foo` — substring match against Subject (use quotes for multi-word: `subject:"q4 plan"`)
- `is:unread` / `is:read` / `is:flagged` / `is:answered`
- `has:attachment`
- `newer_than:7d` / `older_than:30d` — supports `d`, `w`, `m`, `y`
- `after:YYYY-MM-DD` / `before:YYYY-MM-DD`
- `account:name` — friendly account name (see `inbox accounts`)
- `in:mailbox` / `mailbox:name` — restricts to a specific mailbox/folder

Plus a few convenience operators:

- `with:foo` (aliases: `correspondent:foo`, `anywhere:foo`) — matches any of `from`, `to`, `cc`. Use this for "all correspondence with this person" queries instead of issuing three separate searches.
- `from:me` / `to:me` / `with:me` — expands `me` to **all of the user's own email addresses** (across every configured account, or just the one selected by `account:`). Use `from:me` to find messages **sent by the user**, `to:me` for messages addressed to the user, and `with:me` for either direction. Do NOT issue a plain `me` text token; it would substring-match the letters "me" inside random names like "Maeyer".
- `is:sent` — alias for `in:Sent`, restricts to any Sent mailbox.

Operators combine with implicit AND. Negate with `-`, e.g. `from:stripe -subject:invoice`.

Unknown `is:X` / `has:X` operators produce a stderr warning rather than silently no-op-ing, so if a query returns surprising results, check stderr first.

### IDs

Each message has a stable opaque ID (base64url of its `.emlx` filesystem path). The agent should treat IDs as opaque strings, pass them verbatim to `inbox show` / `inbox thread`, and never construct them by hand.

### Attachments and images

Attachments are **not** copied or downloaded. The CLI surfaces the absolute filesystem path of each attachment from Mail.app's local store. To inspect an attachment, the agent can `read` the file directly (for text), use `file` to inspect type, or open it in a viewer. Inline HTML `<img>` references resolve to the same local paths when they're `cid:` attachments.

## Output schema (JSON mode)

`inbox list` / `inbox search` emit one message per line:

```json
{
  "id": "base64url...",
  "account": "Personal",
  "mailbox": "INBOX",
  "from": { "name": "...", "address": "..." },
  "to": [{ "name": "...", "address": "..." }],
  "subject": "...",
  "date": "2025-05-18T08:14:22Z",
  "snippet": "first 200 chars of body...",
  "flags": { "read": false, "flagged": false, "answered": false, "hasAttachment": true },
  "attachments": [{ "filename": "...", "path": "/Users/.../Attachments/..." }]
}
```

`inbox show <id>` emits the same object plus `body` (plain text, HTML stripped) and `headers` (raw header map). Pass `--raw` to get the original RFC822.

## Behavior notes

- **Skip by default:** Trash, Spam, Junk, Drafts, and "Deleted Messages" mailboxes are excluded from searches. Opt back in with `in:trash`, `in:drafts`, etc.
- **Gmail label dedupe:** Gmail mirrors each message into INBOX + Important + `[Gmail]/All Mail`. Results are deduplicated by Message-ID and shown under the most semantic mailbox (INBOX > Important > user folders > All Mail).
- **Fast metadata path:** Mail.app's own SQLite database (`Envelope Index`) is used to pre-narrow candidates whenever the query has structured operators (from/to/subject/is/has/newer_than/account/etc.). This makes `from:foo newer_than:7d` and similar queries respond in ~200ms instead of walking the whole store (~3s). Pure free-text body searches still walk the filesystem because modern macOS Mail no longer maintains body FTS in that DB. The fallback is automatic and invisible to the agent.

## Privacy posture

Never paste email bodies into shared logs, Slack messages, PRs, public reports, or knowledge-base notes without **explicit user confirmation**. Treat email contents as sensitive personal data. Summaries and high-level descriptions (sender, subject, gist) are usually fine; full quotes need a green light.

When the user says "summarize", default to a tight bullet list (sender, subject, one-line gist) rather than dumping bodies.

## Troubleshooting

- **"Operation not permitted" when reading `~/Library/Mail/`**: Grant Full Disk Access and **restart the terminal app**. `inbox doctor` will confirm when access is working.
- **No accounts found**: Mail.app may not have finished initial sync. Open Mail.app and wait for it to catch up.
- **Search returns nothing for old mail**: Mail.app only stores messages it has downloaded. For Gmail IMAP accounts, archived mail lives in `[Gmail]/All Mail`; recent mail in INBOX. Use `inbox mailboxes` to see what's available, then narrow with `in:"All Mail"`.
- **Slow searches**: queries with structured operators (`from:`, `subject:`, `is:unread`, `has:attachment`, dates, `account:`, `in:`) use the SQLite Envelope Index and return in ~200ms. Pure free-text body searches walk the filesystem and can take 5-15s on a large store. Add at least one structured operator (especially `newer_than:`) whenever possible. Set `INBOX_NO_ENVELOPE=1` to force the walker (for benchmarking or troubleshooting).
