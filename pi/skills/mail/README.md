# mail (skill + `inbox` CLI)

Read-only access to the local macOS Mail.app store. Parses `.emlx` files directly under `~/Library/Mail/V<N>/`. No API, no OAuth, no IMAP client. Mail.app does the syncing; this CLI just reads the on-disk store.

The agent-facing instructions live in [`SKILL.md`](./SKILL.md). This README is the developer's view.

## Layout

```
mail/
├── SKILL.md          # agent-facing description
├── README.md         # this file
├── package.json
├── bin/inbox         # bash shim that invokes src/cli.ts via tsx
└── src/
    ├── cli.ts        # argv parsing, command dispatch, output
    ├── discover.ts   # find Mail.app storage, accounts, mailboxes
    ├── envelope.ts   # Envelope Index SQLite fast path (metadata search)
    ├── walk.ts       # recursive .emlx walker (fallback for body matches)
    ├── emlx.ts       # parse one .emlx (length prefix + RFC822 + plist footer)
    ├── headers.ts    # RFC 822 + RFC 2047 + address parsing
    ├── mime.ts       # multipart body walker, transfer-encoding decoder
    ├── html.ts       # HTML → plain text
    ├── search.ts     # Gmail-style query parser + matcher
    ├── dedupe.ts     # Message-ID dedupe with mailbox preference ranking
    ├── format.ts     # human, NDJSON, and TSV output formatters
    ├── id.ts         # opaque message IDs (base64url of absolute path)
    ├── plist.ts      # tiny XML-plist reader + plutil JSON shell-out
    └── types.ts
```

## Why `inbox` and not `mail`

macOS ships `/usr/bin/mail` (BSD `sendmail`-wrapping interactive mail reader). It sits earlier on PATH than `~/.local/bin`, so a binary named `mail` would be shadowed.

## Installation

The dotfiles bootstrap (`./install/bootstrap.sh`) + `pi/install-skills.sh` symlink:

- `~/.agents/skills/mail` → this directory

The agent invokes the CLI by its full skill path (`~/.agents/skills/mail/bin/inbox`). There is no PATH-level alias to avoid colliding with macOS's `/usr/bin/mail`.

Runtime requirements:

- Node ≥ 20 (already provided by `fnm`)
- `tsx` on PATH (already installed globally via pnpm)

## Permissions

Reading `~/Library/Mail/` requires **Full Disk Access** on the terminal binary that hosts the shell (Kitty / Terminal.app / iTerm). Grant in **System Settings → Privacy & Security → Full Disk Access**, then **restart the terminal app**.

Gotcha: macOS treats `/Applications/kitty.app` and `/Applications/Kitty.app` as separate apps with separate FDA grants. Grant access to whichever bundle launches the shell — `ps aux | grep -i kitty` will tell you which one is running.

## How account names are resolved

Mail.app on macOS 26 stopped writing a per-account `Info.plist` with `AccountName`. The skill joins three sources to recover friendly labels:

1. `~/Library/Mail/V<N>/MailData/Signatures/AccountsMap.plist` → maps each Mail-storage UUID to the IMAP/POP URL Mail uses internally. We extract the email from the URL.
2. `~/Library/Accounts/Accounts4.sqlite` (macOS's unified Accounts DB) → has `ZACCOUNTDESCRIPTION` (the friendly label you typed when adding the account in System Settings: "Personal", "Work", "iCloud", etc.) on the top-level (parent) account rows.
3. Local accounts like "On My Mac" have no username; we match them by UUID directly.

Precedence: friendly description > email > UUID. The Accounts DB has multiple rows per username (one per service: Mail, Calendar, Contacts...) so we filter to `ZPARENTACCOUNT IS NULL` and prefer rows whose description differs from the username.

## The `.emlx` format

Each message is a single file with three parts:

```
<decimal-length>\n
<RFC 822 message of exactly <decimal-length> bytes>
<XML or binary plist footer with flags etc.>
```

The plist footer's `flags` integer is a bitfield; we read:

- bit 0: read
- bit 1: deleted
- bit 2: answered
- bit 4: flagged
- bit 6: draft
- bits 10–15: attachment count (6-bit unsigned)

Attachments live beside the `.emlx` at `.../Attachments/<message-id>/<part-number>/<filename>`. The CLI surfaces their absolute paths; it never copies or modifies them.

## Mailbox handling

`walkMailbox` walks a `.mbox` directory and yields `.emlx` files, but **never descends into nested `.mbox` subdirs**. Each `.mbox` is its own mailbox and gets its own `walkMailbox` call. (An earlier bug allowed descent at the root, which misattributed `[Gmail]/Trash` messages to the `[Gmail]` container.)

`SKIP_MAILBOX_PATTERNS` in `discover.ts` filters Trash / Spam / Junk / Drafts / "Deleted Messages" (English and German variants) from default searches. The patterns also match path-suffix forms like `[Gmail]/Trash`. Opt back in with `in:trash` etc.

## Testing without real mail

Set `MAIL_ROOT` to point the CLI at a fixture directory rather than `~/Library/Mail/`:

```sh
export MAIL_ROOT=/tmp/mail-fixtures
inbox accounts
```

The directory layout the CLI expects:

```
$MAIL_ROOT/
└── V<N>/
    └── <ACCOUNT-UUID>/
        └── <MAILBOX-NAME>.mbox/
            └── <UUID>/Data/0/0/0/Messages/<n>.emlx
```

For account name resolution to work in fixtures, you'd also need a matching `AccountsMap.plist` and Accounts4 entry. In practice, fixtures just display the UUIDs.

## Envelope Index backend

Mail.app maintains its own SQLite database at `~/Library/Mail/V<N>/MailData/Envelope Index` with normalized tables for messages, addresses, subjects, recipients, attachments, and mailboxes. `src/envelope.ts` queries it via Node's built-in `node:sqlite` (stable in Node 22+) to pre-narrow candidates before we touch the filesystem.

**Result: 15-20x speedup** on metadata queries. A sender-scoped query like `from:foo newer_than:30d` goes from ~3s (walk) to ~0.2s (envelope) on a mid-sized mailbox (~13K messages).

What the envelope path translates to SQL:

- `from:` / `-from:` — `messages.sender → addresses` (matched against address + display-name comment)
- `to:` / `cc:` / `-to:` — `recipients` join with `type=0` (To) / `type=1` (Cc)
- `with:` (correspondent) — union of sender + all recipients
- `subject:` / `-subject:` — `messages.subject → subjects`
- `is:unread` / `is:read` / `is:flagged`
- `has:attachment` — EXISTS join on `attachments`
- `newer_than:` / `older_than:` / `after:` / `before:` — `date_received` UNIX seconds
- `account:` / `in:mailbox` — via the resolved `mailboxes.url`
- `m.deleted = 0` always applied; skipped mailboxes excluded by mailbox-rowid set

What the envelope path **cannot** translate (and why we still need the walk):

- **Body full-text search.** Modern macOS Mail no longer maintains FTS over message bodies in this DB (body indexing has been moved to CoreSpotlight, which on recent macOS no longer indexes Mail content). Free-text terms (`q.text`) are best-effort pre-narrowed against subject + sender, then post-filtered against the parsed body. Pure body queries with no metadata hint fall through to the filesystem walker.
- `is:answered` — the answered bit position in `messages.flags` varies; we mark it for post-filter so the .emlx parser's authoritative flag bitfield wins.

### How ROWID maps to a `.emlx` file

Empirically verified on this Mac (macOS 26): the `messages.ROWID` IS the `.emlx` filename. The directory shards are the thousands and ten-thousands digits of the ROWID:

```
ROWID 41577  → <mbox>/<snapshot-uuid>/Data/1/4/Messages/41577.emlx
ROWID 30618  → <mbox>/<snapshot-uuid>/Data/0/3/Messages/30618.emlx  (or 30618.partial.emlx)
ROWID 14552  → <mbox>/<snapshot-uuid>/Data/4/1/Messages/14552.emlx
```

The single `<snapshot-uuid>` subdirectory under each `.mbox` is cached on first lookup. For ROWIDs above 99999 the path extends with additional digit positions (we generate them dynamically). When the body is partial (Mail hasn't downloaded the full message yet) the suffix is `.partial.emlx`; we probe both.

### Graceful degradation

`openEnvelopeIndex()` smoke-tests every column we use against a single row up-front. If Apple renames anything between macOS releases, the probe fails and the CLI silently falls back to the filesystem walker. Set `INBOX_NO_ENVELOPE=1` to disable the fast path explicitly (useful for benchmarking or when the DB is mid-write during an Apple sync storm).

## Roadmap / future work

- **Thin SQLite cache** for parsed metadata, keyed off message path + mtime, bodies still fetched on demand. Currently disabled by design (no caching = always fresh; in exchange we pay walk cost per call).
- **Write actions** (mark read, archive, label, send). Out of scope today; this skill is read-only by design. A separate `mail-write` skill could land if needed.
