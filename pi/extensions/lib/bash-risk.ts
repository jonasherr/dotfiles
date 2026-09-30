import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { basename, resolve } from "node:path"

import {
  commandWordIndex,
  executableName,
  maskInertShellText,
  parseShell,
  type ShellSegment,
  type ShellWord,
} from "./shell-inert-text.ts"

export type BashRisk = {
  category: string
  matched: string
  subject: string
}

// Patterns below run against executed shell code only: inert text such as
// search patterns, commit messages, comments, and heredoc documents is masked
// first. `.*` is avoided so a match cannot span separate commands.

const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  // Recursive rm behind wrappers such as ssh, watch, or `bash -c`. rm in
  // command position, `find -exec rm`, and `xargs rm` get target analysis in
  // damage-control-safety instead.
  /(?<!(?:^|[;&|(){}\n])\s*(?:(?:sudo|doas|command|exec|env|nice|nohup|time|caffeinate|then|do|else)(?:\s+-[^\s]+)*\s+)*\\?(?:\/[^\s;|&]+\/)?)(?<!\b(?:git|xargs(?:\s+-[^\s]+)*)\s+)(?<!\s-(?:exec|execdir|ok|okdir)\s+)\brm\s+(?:[^;&|\n]*\s)?(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)(?=[\s"';&|)]|$)/,
  /\bsudo\s+/,
  /\bchmod\s+(?:-[^\s]+\s+)*0?777\b/,
  /\bchown\s+-[Rr][^;&|\n]*\broot\b/,
  /\bkill\s+-9\s+-1\b/,
  /\bkillall\s+-9\b/,
  /\bpkill\s+-9\b/,
  /\bmkfs\./,
  /\bdd\s+[^;&|\n]*\bof=\/dev\/(?!null\b|zero\b|stdout\b|stderr\b|tty\b|fd\/)/,
  /\bhistory\s+-c\b/,
  /\b(?:curl|wget)\b[^;&\n]*\|\s*(?:sudo\s+)?(?:bash|sh|zsh|dash|ksh)\b/,
  // Moving a file onto /dev/null destroys it; `2>/dev/null` redirects do not.
  /\bmv\s+[^;&|\n]*?(?<![<>&]\s*)\/dev\/null\b/,
]

const CLOUD_CLI_PATTERNS: RegExp[] = [
  /\baws\s+s3\s+rm\s+[^;&|\n]*--recursive/,
  /\baws\s+ec2\s+terminate-instances\b/,
  /\baws\s+rds\s+delete-db-instance\b/,
  /\baws\s+cloudformation\s+delete-stack\b/,
  /\baws\s+dynamodb\s+delete-table\b/,
  /\bgcloud\s+projects\s+delete\b/,
  /\bgcloud\s+compute\s+instances\s+delete\b/,
  /\bgcloud\s+sql\s+instances\s+delete\b/,
  /\bgcloud\s+container\s+clusters\s+delete\b/,
  /\bvercel\s+(?:remove|rm)\b[^;&|\n]*\s(?:--yes|-y)\b/,
  /\bvercel\s+projects?\s+(?:rm|remove)\b/,
  /\bdocker\s+system\s+prune\b[^;&|\n]*\s(?:-[A-Za-z]*a[A-Za-z]*|--all|--volumes)\b/,
  /\bdocker\s+volume\s+(?:rm|prune)\b/,
  // `down -v` deletes named volumes, which usually hold local database data.
  /\bdocker(?:-compose|\s+compose)\b[^;&|\n]*\sdown\b[^;&|\n]*\s(?:-v|--volumes)\b/,
  /\bkubectl\s+delete\s+(?:namespace|ns)\b/,
  /\bkubectl\s+delete\s+all\s+--all/,
  /\bterraform\s+destroy\b/,
  /\bpulumi\s+destroy\b/,
  /\bheroku\s+apps:destroy\b/,
  /\bheroku\s+pg:reset\b/,
  /\bredis-cli\b[^;&|\n]*\bFLUSH(?:ALL|DB)\b/i,
  /\bgh\s+repo\s+delete\b/,
  /\bnpm\s+unpublish\b/,
]

// Visible, hard-to-undo remote actions: publishing packages or images and
// changing GitHub state. Dry runs and read-only gh commands stay allowed.
const REMOTE_PUBLISH_PATTERNS: RegExp[] = [
  /\b(?:npm|pnpm|bun|yarn)\b[^;&|\n]*\s(?:npm\s+)?publish(?![\w:-])(?![^;&|\n]*--dry-run)/,
  /\b(?:changeset|lerna)\s+publish\b/,
  /\b(?:cargo|poetry|uv|deno|jsr|vsce|ovsx)\s+publish\b(?![^;&|\n]*--dry-run)/,
  /\b(?:dart|flutter)\s+pub\s+publish\b(?![^;&|\n]*(?:--dry-run|\s-n\b))/,
  /\btwine\s+upload\b/,
  /\bgem\s+push\b/,
  /\bdocker\s+(?:image\s+)?push\b/,
  /\bnpm\s+(?:deprecate|dist-tag\s+(?:add|rm)|owner\s+(?:add|rm))\b/,
  /\bgh\s+(?:pr|issue|release|repo|gist|secret|variable|workflow|run|label|cache|project|ruleset|codespace)\s+(?!(?:view|list|ls|status|diff|checks|download|watch|checkout|clone|browse|logs|set-default)(?![\w-]))[a-z][\w-]*/,
  /\bgh\s+api\b[^;&|\n]*\s(?:-X\s*|--method[=\s]\s*)["']?(?:POST|PUT|PATCH|DELETE)\b/i,
]

const GH_API_VALUE_OPTIONS = new Set([
  "-X", "--method", "-f", "-F", "--field", "--raw-field", "--input", "-H", "--header", "-q", "--jq",
  "-t", "--template", "--hostname", "--cache", "-p", "--preview",
])
const GH_API_FIELD_OPTION = /^(?:-f|-F|--field|--raw-field|--input)(?:=|$)|^-[fF]./

// Backstop for Git run where the token-based Git inspection cannot see it,
// such as `ssh host "git reset --hard"`.
const GIT_BACKSTOP_PATTERNS: RegExp[] = [
  /\bgit\s+reset\s+(?:[^;&|\n]*\s)?--hard\b/,
  /\bgit\s+clean\s+(?:[^;&|\n]*\s)?-[A-Za-z]*f/,
  /\bgit\s+push\b[^;&|\n]*\s(?:--force(?![-\w])|-[A-Za-z]*f[A-Za-z]*(?=[\s"';&|]|$))/,
  /\bgit\s+stash\s+clear\b/,
  /\bgit\s+reflog\s+expire\b/,
  /\bgit\s+gc\s+[^;&|\n]*--prune=now/,
  /\bgit\s+filter-branch\b/,
]

// SQL keywords are case-insensitive, but lowercase "delete from" is common in
// prose. Match any case only when a database client is part of the command.
const DATABASE_CLIENT =
  /\b(?:psql|mysql|mariadb|sqlite3|sqlcmd|mongosh?|cqlsh|clickhouse(?:-client)?|duckdb|snowsql|bq|turso|pscale|supabase|prisma|neonctl|wrangler)\b/
const DATABASE_DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/,
  /\bTRUNCATE\s+(?:TABLE\s+)?[A-Za-z_"`]/,
  /\bDELETE\s+FROM\s+[A-Za-z_"`]/,
]

const EXFILTRATION_PATTERNS: RegExp[] = [
  /\bcurl\b.*@\S*\/(\.(ssh|aws|gcp|gnupg))\//,
  /\bcurl\b.*@\S*\.env\b(?!\.sample|\.example)/,
  /\bcurl\b.*@\S*\.(pem|key|p12|pfx)\b/,
  /\bcurl\b.*@\S*credentials\b/,
  /\bcurl\b.*@\S*\bid_(rsa|ed25519|ecdsa|dsa)\b/,
  /\bcurl\b.*(-T|--upload-file)\s+\S*\/(\.(ssh|aws|gcp|gnupg))\//,
  /\bcurl\b.*(-T|--upload-file)\s+\S*\.(env|pem|key|p12|pfx)\b/,
  /\bwget\b.*--post-file\s*=?\s*\S*\/(\.(ssh|aws|gcp|gnupg))\//,
  /\bwget\b.*--post-file\s*=?\s*\S*\.(env|pem|key|p12|pfx)\b/,
  /\b(nc|ncat|socat)\b.*<\s*\S*\/(\.(ssh|aws|gcp|gnupg))\//,
  /\b(nc|ncat|socat)\b.*<\s*\S*\.(pem|key|p12|pfx)\b/,
  /\bopenssl\b.*s_client.*<\s*\S*\/(\.(ssh|aws|gcp|gnupg))\//,
]

// Fallback when the command cannot be parsed: the previous broad patterns,
// bounded to a single command.
const UNPARSED_SECRET_PATTERNS: RegExp[] = [
  /\b(?:cat|vim|nano|less|head|tail|base64|grep|rg|sed|awk|sort|cut)\s+[^;&|\n]*\.env\b(?!\.sample|\.example)/,
  /\b(?:cat|vim|nano|less|head|tail|cp|scp|rsync)\s+[^;&|\n]*\/\.(?:ssh|aws|gcp|gnupg)\//,
  /\b(?:cat|vim|nano|less|head|tail)\s+[^;&|\n]*\.(?:pem|key|p12|pfx)\b/,
  /\b(?:cp|scp|rsync)\s+[^;&|\n]*\.(?:env|pem|key|p12|pfx)\b/,
]

const SECRET_READERS = new Set([
  "awk", "base64", "bat", "cat", "cut", "egrep", "fgrep", "grep", "head", "hexdump", "jq", "less",
  "more", "nano", "nl", "nvim", "od", "rg", "sed", "sort", "strings", "tail", "vi", "vim", "xxd",
])
// Readers whose first positional argument is a pattern, filter, or script, not a file.
const PATTERN_FIRST_READERS = new Set(["awk", "egrep", "fgrep", "grep", "jq", "rg", "sed"])
const PATTERN_OPTIONS = new Set(["-e", "--regexp", "-f", "--file"])
// Search options whose value is a glob, type, count, or pattern rather than a file to read.
const VALUE_OPTIONS = new Set([
  "-A", "-B", "-C", "-g", "-m", "-t", "-T", "--after-context", "--before-context", "--context",
  "--exclude", "--exclude-dir", "--glob", "--iglob", "--include", "--max-count", "--type",
  "--type-not", "-e", "--regexp",
])
const SECRET_COPIERS = new Set(["cp", "rsync", "scp"])
const OUTBOUND_COMMANDS = new Set([
  "curl", "ftp", "http", "https", "mail", "nc", "ncat", "netcat", "scp", "sendmail", "sftp", "socat",
  "ssh", "telnet", "wget", "xh",
])
const ENV_TEMPLATE = /(?:^|\.)(?:example|sample|template|dist|defaults|schema)(?:\.|$)/
// `credentials.ts` or `credentials.md` is code or documentation, not a secret store.
const CODE_OR_DOC_EXTENSION =
  /\.(?:[cm]?[jt]sx?|go|py|rb|rs|java|kts?|swift|php|cs|c|h|cpp|hpp|scala|exs?|md|mdx|rst|html|css|scss|vue|svelte|astro|sh|snap)$/

function expandHome(path: string): string {
  return path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, homedir())
}

/** True for files that conventionally hold secrets or credentials. */
export function isSecretPath(path: string): boolean {
  const normalized = expandHome(path.trim())
  const parts = normalized.split("/").filter(Boolean)
  const name = basename(normalized)
  if (!name) return false

  const secretDirectory = parts.findIndex((part) => [".ssh", ".aws", ".gcp", ".gnupg"].includes(part))
  if (secretDirectory >= 0) {
    // The directory itself, e.g. `grep -r KEY ~/.ssh`.
    if (secretDirectory === parts.length - 1) return true
    if (parts[secretDirectory] === ".ssh") {
      return !/^(?:config|known_hosts(?:\.old)?|authorized_keys|.+\.pub)$/.test(name)
    }
    if (parts[secretDirectory] === ".aws") return name !== "config"
    return true
  }

  if (/^\.env(?:\..+)?$/.test(name)) return !ENV_TEMPLATE.test(name.slice(".env".length))
  if (name === ".envrc" || /^[\w.-]+\.env$/.test(name)) return true
  if (/^id_(?:rsa|ed25519|ecdsa|dsa)(?:_[\w-]+)?$/.test(name)) return true
  if (/^.+\.(?:pem|key|p12|pfx)$/.test(name)) return true
  if (/^\.?credentials(?:\.[\w-]+)*$/.test(name)) return !CODE_OR_DOC_EXTENSION.test(name)
  if (/.[_.-]credentials\.(?:json|ya?ml|xml|toml)$/.test(name)) return true
  if (name === ".git-credentials" || /\.tfstate(?:\.backup)?$/.test(name)) return true
  return false
}

function firstMatch(value: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) return match[0].trim()
  }
  return undefined
}

function commandName(segment: ShellSegment): { name: string; args: ShellWord[] } {
  const index = commandWordIndex(segment.words)
  return { name: executableName(segment.words[index]?.value), args: segment.words.slice(index + 1) }
}

/** File arguments a reader will open, skipping patterns, scripts, and option values. */
function readerFileArguments(name: string, args: readonly ShellWord[]): string[] {
  const values = args.map(({ value }) => value)
  const explicitPattern = values.some(
    (value) => PATTERN_OPTIONS.has(value) || /^--(?:regexp|file)=/.test(value),
  )
  const files: string[] = []
  let patternSkipped = !PATTERN_FIRST_READERS.has(name) || explicitPattern
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value.startsWith("--file=")) {
      files.push(value.slice("--file=".length))
      continue
    }
    if (value === "-f" || value === "--file") {
      // Patterns read from a file still read that file.
      if (values[index + 1] !== undefined) files.push(values[index + 1])
      index += 1
      continue
    }
    if (VALUE_OPTIONS.has(value)) {
      index += 1
      continue
    }
    if (value.startsWith("-")) continue
    if (!patternSkipped) {
      patternSkipped = true
      continue
    }
    files.push(value)
  }
  return files
}

function secretAccess(segments: readonly ShellSegment[], cwd: string): Omit<BashRisk, "subject"> | undefined {
  for (const segment of segments) {
    for (const redirect of segment.redirects) {
      const target = redirect.target?.value
      if (/^\d*<$/.test(redirect.operator) && target && isSecretPath(target)) {
        return { category: "Secret/credential access", matched: `input redirected from ${target}` }
      }
    }

    const { name, args } = commandName(segment)
    if (SECRET_READERS.has(name)) {
      const secret = readerFileArguments(name, args).find(isSecretPath)
      if (secret) return { category: "Secret/credential access", matched: `${name} reads ${secret}` }
    }

    if (SECRET_COPIERS.has(name)) {
      const positional = args.map(({ value }) => value).filter((value) => !value.startsWith("-"))
      if (positional.length < 2) continue
      const destination = positional[positional.length - 1]
      const secret = positional.slice(0, -1).find(isSecretPath)
      if (secret) return { category: "Secret/credential access", matched: `${name} copies ${secret}` }
      // Creating a new .env from a template is fine; replacing one loses secrets.
      if (isSecretPath(destination) && existsSync(resolve(cwd, expandHome(destination)))) {
        return { category: "Overwriting secret/credential file", matched: `${name} overwrites ${destination}` }
      }
    }
  }
  return undefined
}

function candidatePathWords(segment: ShellSegment): string[] {
  const { name, args } = commandName(segment)
  if (["echo", "printf", "test", "[", "[["].includes(name)) return []
  if (PATTERN_FIRST_READERS.has(name) || ["ag", "ack"].includes(name)) return readerFileArguments(name, args)
  return args.map(({ value }) => value).filter((value) => !value.startsWith("-"))
}

function isOutbound(segment: ShellSegment): boolean {
  const { name, args } = commandName(segment)
  if (OUTBOUND_COMMANDS.has(name)) return true
  return name === "rsync" && args.some(({ value }) => /^[\w.@-]+:/.test(value) || value.startsWith("rsync://"))
}

function genericExfiltration(segments: readonly ShellSegment[]): string | undefined {
  const outbound = segments.find(isOutbound)
  if (!outbound) return undefined
  const secret = segments.flatMap(candidatePathWords).find(isSecretPath)
  return secret ? `${secret} with ${commandName(outbound).name}` : undefined
}

/** `gh api` sends POST when fields are given, unless `-X GET` says otherwise. */
function githubApiWrite(segments: readonly ShellSegment[]): string | undefined {
  for (const segment of segments) {
    const { name, args } = commandName(segment)
    if (name !== "gh" || args[0]?.value !== "api") continue
    const values = args.slice(1).map(({ value }) => value)
    const methodIndex = values.findIndex((value) => value === "-X" || value === "--method")
    const inlineMethod = values.find((value) => /^(?:-X|--method=)./.test(value))?.replace(/^(?:-X|--method=)/, "")
    const method = (methodIndex >= 0 ? values[methodIndex + 1] : inlineMethod)?.toUpperCase()
    const endpoint = values.find(
      (value, index) => !value.startsWith("-") && !GH_API_VALUE_OPTIONS.has(values[index - 1] ?? ""),
    )
    if (method) {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return `gh api -X ${method} ${endpoint ?? ""}`.trim()
      continue
    }
    if (!values.some((value) => GH_API_FIELD_OPTION.test(value))) continue
    // GraphQL reads are POSTed too; only mutations change state.
    if (endpoint === "graphql" && !values.some((value) => /\bmutation\b/.test(value))) continue
    return endpoint === "graphql" ? "gh api graphql mutation" : `gh api ${endpoint ?? ""} with fields (POST)`
  }
  return undefined
}

function databaseRisk(inspected: string): string | undefined {
  const flags = DATABASE_CLIENT.test(inspected) ? "i" : ""
  return firstMatch(inspected, DATABASE_DESTRUCTIVE_PATTERNS.map((pattern) => new RegExp(pattern.source, flags)))
}

/** Detects destructive, secret-reading, or exfiltrating bash commands. */
export function detectBashRisk(
  command: string,
  cwd: string,
  inspected = maskInertShellText(command),
): BashRisk | undefined {
  const checks: Array<[string, readonly RegExp[]]> = [
    ["Dangerous bash command", DANGEROUS_BASH_PATTERNS],
    ["Destructive cloud CLI operation", CLOUD_CLI_PATTERNS],
    ["Dangerous git operation", GIT_BACKSTOP_PATTERNS],
  ]
  for (const [category, patterns] of checks) {
    const matched = firstMatch(inspected, patterns)
    if (matched) return { category, matched, subject: command }
  }

  const parsed = parseShell(command)
  const remote = firstMatch(inspected, REMOTE_PUBLISH_PATTERNS) ??
    (parsed.confident ? githubApiWrite(parsed.segments) : undefined)
  if (remote) return { category: "Publishes or changes remote state", matched: remote, subject: command }

  const database = databaseRisk(inspected)
  if (database) return { category: "Destructive database operation", matched: database, subject: command }

  if (!parsed.confident) {
    const matched = firstMatch(parsed.source, UNPARSED_SECRET_PATTERNS)
    if (matched) return { category: "Secret/credential access", matched, subject: command }
  } else {
    const secret = secretAccess(parsed.segments, cwd)
    if (secret) return { ...secret, subject: command }
  }

  const exfiltration = firstMatch(inspected, EXFILTRATION_PATTERNS)
  if (exfiltration) return { category: "Data exfiltration attempt", matched: exfiltration, subject: command }

  const generic = parsed.confident ? genericExfiltration(parsed.segments) : undefined
  if (generic) return { category: "Potential data exfiltration", matched: generic, subject: command }
  return undefined
}
