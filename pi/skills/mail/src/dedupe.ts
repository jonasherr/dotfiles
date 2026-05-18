// Gmail accounts surface the same physical message under multiple labels
// (INBOX, Important, Starred, [Gmail]/All Mail, etc.). When we walk every
// mailbox, we get the same message N times. Dedupe by Message-ID and prefer
// the most semantic mailbox so the agent sees "INBOX" instead of "All Mail".

import type { MessageMeta } from "./types.js"

const MAILBOX_RANK: Array<[RegExp, number]> = [
  [/^inbox$/i, 0],
  [/^important$/i, 1],
  [/^wichtig$/i, 1],
  [/^starred$/i, 2],
  [/^markiert$/i, 2],
  [/^sent\b/i, 3],
  [/^gesendet$/i, 3],
  [/^archive$/i, 4],
  [/(^|\/)all mail$/i, 5],
  [/(^|\/)alle nachrichten$/i, 5],
  [/^\[gmail\]/i, 6],
]

export function mailboxRank(name: string): number {
  for (const [re, r] of MAILBOX_RANK) if (re.test(name)) return r
  return 3 // user-created folders rank between Sent and Archive
}

export function dedupeByMessageId<T extends MessageMeta>(rows: T[]): T[] {
  const best = new Map<string, T>()
  let synthCounter = 0
  for (const r of rows) {
    const key = r.messageId || `__nomid_${synthCounter++}`
    const prev = best.get(key)
    if (!prev || mailboxRank(r.mailbox) < mailboxRank(prev.mailbox)) {
      best.set(key, r)
    }
  }
  return Array.from(best.values())
}
