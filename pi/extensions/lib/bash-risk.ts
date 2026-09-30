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
  /\bkubectl\b[^;&|\n]*\sdelete\s/,
  /\bhelm\s+(?:uninstall|delete)\b/,
  /\baws\s+s3\s+sync\b[^;&|\n]*--delete\b/,
  /\baws\s+s3\s+rb\b/,
  /\bterraform\s+destroy\b/,
  /\bpulumi\s+destroy\b/,
  /\bheroku\s+apps:destroy\b/,
  /\bheroku\s+pg:reset\b/,
  /\bredis-cli\b[^;&|\n]*\bFLUSH(?:ALL|DB)\b/i,
  /\bgh\s+repo\s+delete\b/,
  /\bnpm\s+unpublish\b/,
]

const VERCEL_WRITE_PATTERNS: RegExp[] = [
  /\bvercel\s+env\s+(?:add|rm|remove|update)\b/,
  /\bvercel\s+(?:domains|dns|alias|certs|blob|integration|teams|project|projects)\s+(?:add|rm|remove|delete|del|set|move|transfer|transfer-in|buy)\b/,
  /\bvercel\s+(?:promote|rollback|redeploy)\b/,
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
  /\bprisma\s+migrate\s+reset\b/,
  /\bprisma\s+db\s+push\b[^;&|\n]*--(?:force-reset|accept-data-loss)\b/,
  /\bsupabase\s+db\s+reset\b/,
  /\bdropdb\b/,
  /\b(?:rails|rake|bin\/rails)\s+db:(?:drop|reset|migrate:reset|schema:load|purge|truncate_all)\b/,
  /\bdropDatabase\s*\(/,
  /\bturso\s+db\s+destroy\b/,
  /\bneonctl\s+(?:branches|projects|databases)\s+delete\b/,
  /\bpscale\s+(?:database|branch)\s+delete\b/,
  /\bwrangler\s+d1\s+delete\b/,
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
    if (endpoint === "graphql" && !values.some((value) => GRAPHQL_MUTATION.test(value))) continue
    return endpoint === "graphql" ? "gh api graphql mutation" : `gh api ${endpoint ?? ""} with fields (POST)`
  }
  return undefined
}

function databaseRisk(inspected: string): string | undefined {
  const flags = DATABASE_CLIENT.test(inspected) ? "i" : ""
  return firstMatch(inspected, DATABASE_DESTRUCTIVE_PATTERNS.map((pattern) => new RegExp(pattern.source, flags)))
}

// A GraphQL mutation operation, not a variable or field named "mutation".
const GRAPHQL_MUTATION = /\bmutation\s*[({A-Za-z]/

const SECRET_ENV_PARTS = new Set([
  "KEY", "KEYS", "TOKEN", "TOKENS", "SECRET", "SECRETS", "PASSWORD", "PASSWD", "PASS",
  "CREDENTIAL", "CREDENTIALS", "CREDS", "PAT", "DSN", "PRIVATE", "APIKEY", "AUTH", "COOKIE",
])
const SAFE_ENV_NAMES = new Set([
  "PWD", "OLDPWD", "PATH", "HOME", "USER", "SHELL", "NODE_ENV", "TERM", "LANG", "EDITOR",
  "SSH_AUTH_SOCK",
])

function isSecretEnvName(name: string): boolean {
  const upper = name.toUpperCase()
  // NEXT_PUBLIC_*, PUBLIC_*, and similar values ship to browsers by design.
  if (SAFE_ENV_NAMES.has(upper) || upper.split("_").includes("PUBLIC")) return false
  return /^(?:DATABASE_URL|.+_DATABASE_URL|POSTGRES.*_URL|REDIS_URL|MONGO_URI|MONGODB_URI|CONNECTION_STRING)$/.test(upper) ||
    upper.split("_").some((part) => SECRET_ENV_PARTS.has(part))
}

function secretVariableReferences(value: string): string[] {
  const names = new Set<string>()
  const pattern = /\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[^}]*)?\}/g
  for (const match of value.matchAll(pattern)) {
    const name = match[1] ?? match[2]
    if (isSecretEnvName(name)) names.add(name)
  }
  return [...names]
}

function pipelineGroups(segments: readonly ShellSegment[]): ShellSegment[][] {
  const groups: ShellSegment[][] = []
  for (const segment of segments) {
    if (segment.operatorBefore.startsWith("|") && segment.operatorBefore !== "||" && groups.length) {
      groups[groups.length - 1].push(segment)
    } else groups.push([segment])
  }
  return groups
}


function printingSecret(segment: ShellSegment): string | undefined {
  // Assignments such as `TOKEN=$(gh auth token)` capture output instead of
  // printing it; substitutions only count below when echo or printf prints them.
  const commandIndex = commandWordIndex(segment.words)
  const parsedCommand = commandName(segment)
  const name = segment.words[0]?.value === "env" && commandIndex >= segment.words.length ? "env" : parsedCommand.name
  const args = parsedCommand.args
  const values = args.map(({ value }) => value)
  if (["env", "printenv", "export", "set", "declare", "typeset"].includes(name)) {
    const options = values.filter((value) => value.startsWith("-"))
    const operands = values.filter((value) => !value.startsWith("-"))
    const dumps = (name === "env" || name === "printenv") && operands.length === 0 ||
      name === "export" && (operands.length === 0 || values.length === 1 && values[0] === "-p") ||
      name === "set" && options.length === 0 && operands.length === 0 ||
      (name === "declare" || name === "typeset") && options.some((value) => /^-[px]+$/.test(value)) && operands.length === 0
    if (dumps) return `${name} prints environment values`
  }
  if (["echo", "printf", "printenv"].includes(name)) {
    const printed = values
    for (const value of printed) {
      const reference = secretVariableReferences(value)[0]
      if (reference) return `${name} prints ${reference}`
      const substitution = value.match(/\$\(([^()]*)\)/)
      if (substitution) {
        const nested = parseShell(substitution[1])
        for (const command of nested.segments) {
          const nestedRisk = credentialCliRisk(commandName(command).name, commandName(command).args.map(({ value: item }) => item))
          if (nestedRisk) return `${name} prints command substitution (${nestedRisk})`
        }
      }
    }
    if (name === "printenv" && values.some(isSecretEnvName)) return `printenv prints ${values.find(isSecretEnvName)}`
  }
  const cli = credentialCliRisk(name, values)
  if (cli) return cli
  const code = inlineEnvironmentPrint(name, values)
  if (code) return code
  return undefined
}

function credentialCliRisk(name: string, values: string[]): string | undefined {
  const args = values.join(" ")
  if (name === "gh" && /^auth\s+token(?:\s|$)/.test(args)) return "gh auth token"
  if (name === "gh" && /^auth\s+status\b/.test(args) && /(?:^|\s)(?:-t|--show-token)(?:\s|$)/.test(args)) return "gh auth status --show-token"
  if (name === "gcloud" && /^(?:auth\s+print-(?:access|identity)-token|auth\s+application-default\s+print-access-token)\b/.test(args)) return "gcloud prints an access token"
  if (name === "aws" && /^configure\s+export-credentials\b/.test(args)) return "aws configure export-credentials"
  if (name === "aws" && /^configure\s+get\s+[^\s]+/.test(args) && /secret|key|token/i.test(args.replace(/^configure\s+get\s+/, ""))) return "aws configure get credential"
  if (name === "aws" && /^sts\s+(?:get-session-token|assume-role)\b/.test(args)) return "aws sts prints credentials"
  if (name === "az" && /^account\s+get-access-token\b/.test(args)) return "az account get-access-token"
  if (name === "security" && /^find-(?:generic|internet)-password\b/.test(args) && /(?:^|\s)(?:-w|-g)(?:\s|$)/.test(args)) return "security prints a stored password"
  if (name === "kubectl" && /^get\s+secrets?\b/.test(args) && /(?:^|\s)-o(?:\s|=)(?:yaml|json|jsonpath|go-template)/.test(args)) return "kubectl prints a secret"
  if (name === "heroku" && /^config(?::get)?(?:\s|$)/.test(args)) return "heroku prints config values"
  // `op` is intentionally exempt: the dedicated Agent vault is a secrets workflow.
  return undefined
}

// Checks such as `process.env.KEY ? "configured" : "missing"`, `!!process.env.KEY`,
// or `os.getenv("KEY") is None` print a label or boolean, not the value.
const VALUE_TEST_BEFORE = /(?:!!|\bBoolean\(\s*|\bbool\(\s*|\btypeof\s+)$/
const VALUE_TEST_AFTER = /^\s*(?:\?(?![.?])|[!=]==?|\??\.length\b|is\s+(?:not\s+)?None\b)/

/** The first secret-looking variable whose value the code emits, if any. */
function emittedSecretVariable(code: string, pattern: RegExp): string | undefined {
  for (const match of code.matchAll(pattern)) {
    const variable = match[1] ?? match[2]
    if (!variable || !isSecretEnvName(variable)) continue
    const before = code.slice(0, match.index)
    const after = code.slice((match.index ?? 0) + match[0].length)
    if (!VALUE_TEST_BEFORE.test(before) && !VALUE_TEST_AFTER.test(after)) return variable
  }
  return undefined
}

function inlineEnvironmentPrint(name: string, values: string[]): string | undefined {
  if (!["node", "bun", "deno", "python", "python3"].includes(name)) return undefined
  const flagIndex = values.findIndex((value) => ["-e", "--eval", "-p", "--print", "-c"].includes(value))
  if (flagIndex < 0) return undefined
  const flag = values[flagIndex]
  const code = values.slice(flagIndex + 1).join(" ")
  const alwaysPrints = flag === "-p" || flag === "--print"
  if (!alwaysPrints && !/(?:console\.(?:log|dir)|process\.stdout\.write|\bprint\s*\(|sys\.stdout\.write|pprint)/.test(code)) return undefined
  if (["node", "bun", "deno"].includes(name)) {
    if (/process\.env(?![.\[\w])/.test(code) && !/Object\.keys\s*\(\s*process\.env\s*\)/.test(code)) return `${name} prints process.env`
    const variable = emittedSecretVariable(
      code,
      /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\])/g,
    )
    if (variable) return `${name} prints ${variable}`
  } else if (/os\.environ(?:\s*(?:\[|\.get\s*\())|os\.getenv\s*\(/.test(code)) {
    if (/os\.environ(?!\s*(?:\[|\.get\s*\())/.test(code)) return `${name} prints os.environ`
    const variable = emittedSecretVariable(
      code,
      /(?:os\.environ\s*\[\s*|os\.environ\.get\s*\(\s*|os\.getenv\s*\(\s*)["']([A-Za-z_][A-Za-z0-9_]*)["']\s*[\])]?/g,
    )
    if (variable) return `${name} prints ${variable}`
  }
  return undefined
}

function remoteWriteRisk(segments: readonly ShellSegment[]): string | undefined {
  for (const segment of segments) {
    const { name, args } = commandName(segment)
    const values = args.map(({ value }) => value)
    if (name === "vercel") {
      const match = firstMatch(["vercel", ...values].join(" "), VERCEL_WRITE_PATTERNS)
      if (match) return match
    }
    if (name === "curl") {
      let method = "GET"
      let explicit = false
      let forceGet = false
      let forceHead = false
      let data = ""
      const urls: string[] = []
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (value === "-X" || value === "--request") {
          method = values[index + 1]?.toUpperCase() ?? ""
          explicit = true
          index += 1
        } else if (/^-X.+/i.test(value)) { method = value.slice(2).toUpperCase(); explicit = true }
        else if (/^--request=/i.test(value)) { method = value.slice(value.indexOf("=") + 1).toUpperCase(); explicit = true }
        else if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "--form-string", "-T", "--upload-file"].includes(value)) {
          if (!explicit) method = value === "-T" || value === "--upload-file" ? "PUT" : "POST"
          data += `${values[index + 1] ?? ""} `
          index += 1
        } else if (/^(?:--data(?:-raw|-binary|-urlencode)?|--json|--form(?:-string)?|--upload-file)=/.test(value)) {
          if (!explicit) method = /upload-file/.test(value) ? "PUT" : "POST"
          data += `${value.slice(value.indexOf("=") + 1)} `
        } else if (value === "-G" || value === "--get") forceGet = true
        else if (value === "-I" || value === "--head") forceHead = true
        else if (value === "--url") {
          if (values[index + 1] !== undefined) urls.push(values[index + 1])
          index += 1
        } else if (value.startsWith("--url=")) urls.push(value.slice("--url=".length))
        else if (/^(?:https?:\/\/|\/\/|\$)/i.test(value) || !value.startsWith("-") && index === values.length - 1) urls.push(value)
      }
      if (forceGet) method = "GET"
      else if (forceHead) method = "HEAD"
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) continue
      // curl transfers to every URL, so one remote URL is enough to ask.
      const remote = urls.length === 0 ? "unknown host" : urls.find((url) => !isLocalHost(extractHost(url) ?? ""))
      if (!remote) continue
      const graphqlRead = urls.every((url) => url.includes("/graphql")) && /\bquery\b/.test(data) && !GRAPHQL_MUTATION.test(data)
      if (graphqlRead) continue
      return `curl ${method} ${remote}`
    }
    if (["wget"].includes(name)) {
      const method = values.find((value) => /^--method=/i.test(value))?.split("=")[1]?.toUpperCase()
      const posts = values.some((value) => ["--post-data", "--post-file", "--body-data"].includes(value) || /^(?:--post-data|--post-file|--body-data)=/.test(value))
      const verb = method ?? (posts ? "POST" : "")
      const url = values.find((value) => /^https?:\/\//i.test(value))
      const host = extractHost(url)
      if (["POST", "PUT", "PATCH", "DELETE"].includes(verb) && (!host || !isLocalHost(host))) return `wget ${verb} ${url ?? "unknown host"}`
    }
    if (["http", "https", "xh", "xhs"].includes(name)) {
      const methodIndex = values.findIndex((value) => /^(?:POST|PUT|PATCH|DELETE)$/i.test(value))
      const target = values.find((value) => /^https?:\/\//i.test(value)) ??
        values[methodIndex >= 0 ? methodIndex + 1 : 0]
      // Data items such as `name=x`, `count:=3`, or `file@a.txt` imply POST.
      // Query parameters (`q==x`), headers (`Accept:json`), and URLs do not.
      const item = values.some((value) => !value.startsWith("-") && /^[\w.[\]-]+(?::=|=(?!=)|@)/.test(value))
      const method = methodIndex >= 0 ? values[methodIndex].toUpperCase() : item ? "POST" : ""
      const host = extractHost(target)
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && (!host || !isLocalHost(host))) return `${name} ${method} ${target ?? "unknown host"}`
    }
  }
  return undefined
}

function extractHost(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/^(?:[a-z][a-z0-9+.-]*:)?\/\/(\[[^\]]+\]|[^/:?#]+)/i)
  const host = match?.[1] ?? url.split(/[/:?#]/)[0]
  return host.replace(/:\d+$/, "")
}

function isLocalHost(host: string): boolean {
  return /^(?:localhost|(?:[^.]+\.)*localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal|(?:[^.]+\.)*local)$/i.test(host)
}

function secretOutputRisk(segments: readonly ShellSegment[]): string | undefined {
  for (const pipeline of pipelineGroups(segments)) {
    for (let index = 0; index < pipeline.length; index += 1) {
      const segment = pipeline[index]
      const risk = printingSecret(segment)
      // Redirecting to a file is not an exemption: the secret lands on disk
      // and a later read prints it.
      if (!risk) continue
      const sinks = pipeline.slice(index + 1)
      // tee saves a copy, so a pipeline through tee never counts as a sink.
      const tees = sinks.some((sink) => commandName(sink).name === "tee")
      const suppressed = !tees && sinks.some((sink) => {
        const { name, args } = commandName(sink)
        const values = args.map(({ value }) => value)
        return name === "wc" || name === "pbcopy" || values.includes("--password-stdin") || values.includes("--with-token")
      })
      if (!suppressed) return risk
    }
  }
  return undefined
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
    const printed = secretOutputRisk(parsed.segments)
    if (printed) return { category: "Secret/credential access", matched: printed, subject: command }
    const secret = secretAccess(parsed.segments, cwd)
    if (secret) return { ...secret, subject: command }
  }

  const exfiltration = firstMatch(inspected, EXFILTRATION_PATTERNS)
  if (exfiltration) return { category: "Data exfiltration attempt", matched: exfiltration, subject: command }

  const remoteWrite = parsed.confident ? remoteWriteRisk(parsed.segments) : undefined
  if (remoteWrite) return { category: "Publishes or changes remote state", matched: remoteWrite, subject: command }

  const generic = parsed.confident ? genericExfiltration(parsed.segments) : undefined
  if (generic) return { category: "Potential data exfiltration", matched: generic, subject: command }
  return undefined
}
