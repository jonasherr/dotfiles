import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"
import { notifyTerminalPermission } from "./terminal-notify"

// ─── Category 1: Dangerous Bash Commands ─────────────────────────────────────
const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  /\brm\s+(-[^\s]*)*-[rRf]/,
  /\brm\s+.*--(recursive|force)/,
  /\bsudo\s+/,
  /\bchmod\s+(-[^\s]+\s+)*0?777\b/,
  /\bchmod\s+-[Rr].*0?777/,
  /\bchown\s+-[Rr].*\broot\b/,
  /\bkill\s+-9\s+-1\b/,
  /\bkillall\s+-9\b/,
  /\bpkill\s+-9\b/,
  /\bmkfs\./,
  /\bdd\s+.*of=\/dev\//,
  /\bhistory\s+-c\b/,
  /\bcurl\s+.*\|\s*(bash|sh|zsh)\b/,
  /\bwget\s+.*\|\s*(bash|sh|zsh)\b/,
  /\bmv\s+.*\/dev\/null/,
]

// ─── Category 2: Secret/Credential Access (bash) ─────────────────────────────
const SECRET_BASH_PATTERNS: RegExp[] = [
  /(cat|vim|nano|less|head|tail|base64|grep|sed|awk|sort|cut)\s+.*\.env\b(?!\.sample|\.example)/,
  /(cat|vim|nano|less|head|tail|cp|scp|rsync)\s+.*\/(\.(ssh|aws|gcp|gnupg))\//,
  /(cat|vim|nano|less|head|tail)\s+.*\.(pem|key|p12|pfx)\b/,
  /(cat|vim|nano|less|head|tail|grep|sed|awk|sort|cut)\s+.*credentials/,
  /(cp|scp|rsync)\s+.*\.(env|pem|key|p12|pfx)\b/,
  /(cp|scp|rsync)\s+.*\/(\.(ssh|aws|gcp|gnupg))\//,
]

// ─── Category 2: Secret/Credential Access (file paths) ───────────────────────
const SECRET_PATH_PATTERNS: RegExp[] = [
  /\/\.env(?!\.sample|\.example)/,
  /\/\.env\.(?!sample|example)/,
  /\/\.ssh\//,
  /\/\.aws\//,
  /\/\.gcp\//,
  /\/\.gnupg\//,
  /\/(\.(ssh|aws|gcp|gnupg))\/.*(pem|key|p12|pfx)$/,
  /\/\.tfstate$/,
  /\/(\.|^)credentials$/,
  /\/credentials\.(json|yaml|yml|xml|toml)$/,
]

// ─── Category 3: Destructive File Paths ──────────────────────────────────────
const DESTRUCTIVE_PATH_PATTERNS: RegExp[] = [
  /\/node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/\.next\//,
  /\/__pycache__\//,
  /\/\.venv\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /bun\.lockb$/,
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,
]

// ─── Category 4: Cloud CLI Destructive Ops ───────────────────────────────────
const CLOUD_CLI_PATTERNS: RegExp[] = [
  /\baws\s+s3\s+rm\s+.*--recursive/,
  /\baws\s+ec2\s+terminate-instances\b/,
  /\baws\s+rds\s+delete-db-instance\b/,
  /\baws\s+cloudformation\s+delete-stack\b/,
  /\baws\s+dynamodb\s+delete-table\b/,
  /\bgcloud\s+projects\s+delete\b/,
  /\bgcloud\s+compute\s+instances\s+delete\b/,
  /\bgcloud\s+sql\s+instances\s+delete\b/,
  /\bgcloud\s+container\s+clusters\s+delete\b/,
  /\bvercel\s+remove\s+.*--yes/,
  /\bvercel\s+projects\s+rm\b/,
  /\bdocker\s+system\s+prune\s+.*-a/,
  /\bdocker\s+volume\s+(rm|prune)\b/,
  /\bkubectl\s+delete\s+namespace\b/,
  /\bkubectl\s+delete\s+all\s+--all/,
  /\bterraform\s+destroy\b/,
  /\bpulumi\s+destroy\b/,
  /\bheroku\s+apps:destroy\b/,
  /\bheroku\s+pg:reset\b/,
  /\bredis-cli\s+FLUSHALL/,
  /\bredis-cli\s+FLUSHDB/,
  /\bgh\s+repo\s+delete\b/,
  /\bgh\s+pr\s+merge\b/,
  /\bnpm\s+unpublish\b/,
]

// ─── Category 4b: Database Destructive Ops ───────────────────────────────────
const DATABASE_DESTRUCTIVE_PATTERNS: RegExp[] = [
  /DROP\s+(TABLE|DATABASE)\b/i,
  /TRUNCATE\s+TABLE\b/i,
  /DELETE\s+FROM\s+\w+/i,
]

// ─── Category 5: Git Safety ─────────────────────────────────────────────────
const GIT_SAFETY_PATTERNS: RegExp[] = [
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+.*-[fFxX]/,
  /\bgit\s+push\s+.*--force(?!-with-lease|-if-includes)/,
  /\bgit\s+push\s+.*-[^\s]*f/,
  /\bgit\s+stash\s+clear\b/,
  /\bgit\s+reflog\s+expire\b/,
  /\bgit\s+gc\s+.*--prune=now/,
  /\bgit\s+filter-branch\b/,
]

// ─── Category 6: Data Exfiltration ──────────────────────────────────────────
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

const SENSITIVE_PATH_INDICATORS: RegExp[] = [
  /\/(\.(ssh|aws|gcp|gnupg))\//,
  /\.env\b(?!\.sample|\.example)/,
  /\.(pem|key|p12|pfx)\b/,
  /\/credentials\b/,
  /\bid_(rsa|ed25519|ecdsa|dsa)\b/,
]

const OUTBOUND_INDICATORS: RegExp[] = [
  /https?:\/\//,
  /\bcurl\b/,
  /\bwget\b/,
  /\b(nc|ncat|netcat)\s+\S+\s+\d+/,
  /\bsocat\b.*TCP/i,
  /\bsendmail\b/,
  /\btelnet\b/,
]

type Risk = {
  category: string
  matched: string
  subject: string
}

function testPatterns(value: string, patterns: RegExp[]): RegExp | undefined {
  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return pattern
    }
  }
  return undefined
}

function hasExfiltrationRisk(command: string): boolean {
  const hasSensitivePath = SENSITIVE_PATH_INDICATORS.some((pattern) => pattern.test(command))
  const hasOutbound = OUTBOUND_INDICATORS.some((pattern) => pattern.test(command))
  return hasSensitivePath && hasOutbound
}

function detectBashRisk(command: string): Risk | undefined {
  const checks: Array<[string, RegExp[]]> = [
    ["Dangerous bash command", DANGEROUS_BASH_PATTERNS],
    ["Secret/credential access", SECRET_BASH_PATTERNS],
    ["Destructive cloud CLI operation", CLOUD_CLI_PATTERNS],
    ["Destructive database operation", DATABASE_DESTRUCTIVE_PATTERNS],
    ["Dangerous git operation", GIT_SAFETY_PATTERNS],
    ["Data exfiltration attempt", EXFILTRATION_PATTERNS],
  ]

  for (const [category, patterns] of checks) {
    const match = testPatterns(command, patterns)
    if (match) {
      return { category, matched: String(match), subject: command }
    }
  }

  if (hasExfiltrationRisk(command)) {
    return {
      category: "Potential data exfiltration",
      matched: "sensitive path + outbound network destination",
      subject: command,
    }
  }

  return undefined
}

function detectReadRisk(path: string): Risk | undefined {
  const secretPathMatch = testPatterns(path, SECRET_PATH_PATTERNS)
  if (secretPathMatch) {
    return {
      category: "Reading secret/credential file",
      matched: String(secretPathMatch),
      subject: path,
    }
  }
  return undefined
}

function detectWriteRisk(path: string): Risk | undefined {
  const secretPathMatch = testPatterns(path, SECRET_PATH_PATTERNS)
  if (secretPathMatch) {
    return {
      category: "Writing to secret/credential file",
      matched: String(secretPathMatch),
      subject: path,
    }
  }

  const destructivePathMatch = testPatterns(path, DESTRUCTIVE_PATH_PATTERNS)
  if (destructivePathMatch) {
    return {
      category: "Writing to generated/locked file",
      matched: String(destructivePathMatch),
      subject: path,
    }
  }

  return undefined
}

async function requestApproval(ctx: ExtensionContext, risk: Risk) {
  notifyTerminalPermission(risk.subject)

  const message = [
    `${risk.category} matched damage-control rules.`,
    "",
    risk.subject,
    "",
    `Matched: ${risk.matched}`,
    "",
    "Allow this tool call?",
  ].join("\n")

  if (!ctx.hasUI) {
    return {
      block: true,
      reason: `[damage-control] ${risk.category} blocked because no UI is available for human approval`,
    }
  }

  try {
    const approved = await ctx.ui.confirm("⚠️ Damage Control", message)
    if (!approved) {
      return { block: true, reason: `[damage-control] ${risk.category} blocked by user` }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      block: true,
      reason: `[damage-control] ${risk.category} blocked because approval failed: ${detail}`,
    }
  }

  return undefined
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && typeof event.input.command === "string") {
      const risk = detectBashRisk(event.input.command)
      if (risk) return requestApproval(ctx, risk)
    }

    if (event.toolName === "read" && typeof event.input.path === "string") {
      const risk = detectReadRisk(event.input.path)
      if (risk) return requestApproval(ctx, risk)
    }

    if (
      (event.toolName === "edit" || event.toolName === "write") &&
      typeof event.input.path === "string"
    ) {
      const risk = detectWriteRisk(event.input.path)
      if (risk) return requestApproval(ctx, risk)
    }

    return undefined
  })
}
