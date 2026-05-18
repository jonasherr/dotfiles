// Walk Mail.app's storage looking for .emlx files. We try to be cheap:
//   - skip Attachments/ directories
//   - allow callers to filter by mtime before parsing
//   - yield results so callers can stop early after N matches

import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { Mailbox } from "./types.js"

export interface WalkOptions {
  /** Only yield messages newer than this epoch-ms. Cheap mtime filter. */
  newerThanMs?: number
  /** Only yield messages older than this epoch-ms. */
  olderThanMs?: number
}

export interface MessageFile {
  path: string
  mtimeMs: number
  mailbox: Mailbox
}

/** Yield .emlx files under a mailbox, newest-first by mtime. */
export function* walkMailbox(mailbox: Mailbox, opts: WalkOptions = {}): Generator<MessageFile> {
  const found: MessageFile[] = []
  collect(mailbox.path, mailbox, opts, found)
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const f of found) yield f
}

function collect(dir: string, mailbox: Mailbox, opts: WalkOptions, out: MessageFile[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    // Never descend into sub-mailboxes: each .mbox is walked by its own
    // walkMailbox() call, so even at the root level we must skip them.
    // (Earlier this only skipped at depth > 1, which caused [Gmail]/Trash
    // messages to be wrongly attributed to the parent [Gmail] mailbox.)
    if (entry.endsWith(".mbox")) continue
    // Skip attachment payload trees entirely.
    if (entry === "Attachments") continue
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      collect(full, mailbox, opts, out)
    } else if (s.isFile() && entry.endsWith(".emlx")) {
      const m = s.mtimeMs
      if (opts.newerThanMs && m < opts.newerThanMs) continue
      if (opts.olderThanMs && m > opts.olderThanMs) continue
      out.push({ path: full, mtimeMs: m, mailbox })
    }
  }
}
