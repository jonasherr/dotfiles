// Shared types for the mail CLI.

export interface Address {
  name: string | null
  address: string
}

export interface Flags {
  read: boolean
  flagged: boolean
  answered: boolean
  hasAttachment: boolean
  draft: boolean
  deleted: boolean
}

export interface Attachment {
  filename: string
  path: string
  contentType: string | null
  size: number | null
}

export interface MessageMeta {
  id: string
  path: string
  account: string
  mailbox: string
  from: Address | null
  to: Address[]
  cc: Address[]
  subject: string
  date: string // ISO 8601
  dateMs: number
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  snippet: string
  flags: Flags
  attachments: Attachment[]
}

export interface MessageFull extends MessageMeta {
  body: string
  bodyHtml: string | null
  headers: Record<string, string[]>
}

export interface Account {
  uuid: string
  name: string
  emailAddresses: string[]
  storagePath: string // absolute path to the account directory
}

export interface Mailbox {
  account: string
  name: string // friendly, e.g. "INBOX" or "All Mail"
  path: string // absolute path to the .mbox directory
}
