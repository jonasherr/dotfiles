import { homedir } from "node:os"
import { realpath } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"

export type DestructiveShellRisk = {
  category: string
  matched: string
  subject: string
  hardBlock?: boolean
}

const RECURSIVE_DELETE = [
  /(?:^|[;&|()]|\b(?:then|do|sudo|command|exec|env)\s+)\s*(?:(?:sudo|command|exec|env)(?:\s+-[^\s]+)*\s+)*(?:\/[^\s;|&]+\/)?rm\s+(?=[^;|&\n]*(?:-[^\s]*[rR]|--recursive\b))[^;|&\n]*/i,
  /\bfind\b[^;|&\n]*(?:-delete\b|-exec(?:dir)?\s+(?:\/[^\s;|&]+\/)?rm\b)/i,
  /\b(?:xargs\s+(?:-[^\s]+\s+)*(?:\/[^\s;|&]+\/)?rm|shutil\.rmtree|(?:fs\.|require\s*\(\s*["']fs["']\s*\)\.)(?:rm|rmSync)\s*\(|Deno\.remove\s*\(|Remove-Item\b[^;|&\n]*-Recurse)/i,
  /\brsync\b[^;|&\n]*--delete(?:-before|-during|-delay|-after|-excluded)?\b/i,
]

const MOUNT_CLEANUP = /\b(?:mount\s+--bind|mount\s+-o\s+bind|unshare\b)/i
const SHELL_VARIABLE = /(^|[^\\])(?:\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]+\}|\()|`)/
const FAIL_CLOSED_VARIABLE = /\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/g

function shellWords(fragment: string): string[] {
  return fragment.match(/(?:"(?:\\.|[^"])*"|'[^']*'|\\.|[^\s])+/g) ?? []
}

function unquote(word: string): string {
  if ((word.startsWith("'") && word.endsWith("'")) || (word.startsWith('"') && word.endsWith('"'))) {
    return word.slice(1, -1)
  }
  return word
}

function rmTargets(fragment: string): string[] {
  const rmIndex = fragment.search(/\brm\b/i)
  if (rmIndex < 0) return []
  const words = shellWords(fragment.slice(rmIndex)).slice(1)
  const targets: string[] = []
  let optionsEnded = false
  for (const raw of words) {
    const word = unquote(raw).replace(/[;&|]+$/, "")
    if (!word) continue
    if (!optionsEnded && word === "--") {
      optionsEnded = true
      continue
    }
    if (!optionsEnded && word.startsWith("-")) continue
    targets.push(word)
  }
  return targets
}

function isHomeSpelling(target: string): boolean {
  return /^(?:~|~\/|\$HOME\/?|\$\{HOME\}\/?|\$\{HOME:\?[^}]*\}\/?)$/.test(target)
}

function isRootSpelling(target: string): boolean {
  const normalized = target.replace(/\/+$/, "") || "/"
  return normalized === "/" || normalized === "/*"
}

function hasUnprotectedVariable(value: string): boolean {
  return SHELL_VARIABLE.test(value.replace(FAIL_CLOSED_VARIABLE, ""))
}

async function canonicalizeExisting(path: string): Promise<string> {
  let candidate = path
  const suffix: string[] = []
  while (true) {
    try {
      const existing = await realpath(candidate)
      return resolve(existing, ...suffix.reverse())
    } catch {
      const parent = dirname(candidate)
      if (parent === candidate) return resolve(path)
      suffix.push(candidate.slice(parent.length + (parent.endsWith("/") ? 0 : 1)))
      candidate = parent
    }
  }
}

function isSamePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

export async function detectDestructiveShellRisk(
  command: string,
  cwd: string,
): Promise<DestructiveShellRisk | undefined> {
  // Bash removes escaped newlines before parsing. Do the same so a model cannot
  // split `rm` and `-rf` across lines to bypass preflight checks.
  const normalizedCommand = command.replace(/\\\r?\n/g, "")
  const recursiveMatch = RECURSIVE_DELETE.map((pattern) => normalizedCommand.match(pattern)).find(Boolean)
  if (!recursiveMatch) {
    if (MOUNT_CLEANUP.test(normalizedCommand) && /\b(?:rm\s+|rmtree)/i.test(normalizedCommand)) {
      return {
        category: "Mount or temporary-directory cleanup",
        matched: "mount/namespace setup combined with automatic or recursive cleanup",
        subject: command,
      }
    }
    return undefined
  }

  const fragment = recursiveMatch[0]
  if (hasUnprotectedVariable(fragment)) {
    return {
      category: "Unsafe variable-expanded recursive deletion",
      matched: "recursive deletion target contains a shell variable without ${VAR:?message} fail-closed expansion",
      subject: command,
      hardBlock: true,
    }
  }

  const targets = rmTargets(fragment)
  for (const target of targets) {
    if (isRootSpelling(target) || isHomeSpelling(target)) {
      return {
        category: "Catastrophic recursive deletion target",
        matched: `target resolves syntactically to root or the home directory: ${target}`,
        subject: command,
        hardBlock: true,
      }
    }

    if (!/[`$*?{}[\]]/.test(target)) {
      const expanded = target.startsWith("~/") ? resolve(homedir(), target.slice(2)) : isAbsolute(target) ? target : resolve(cwd, target)
      const canonical = await canonicalizeExisting(expanded)
      const canonicalHome = await canonicalizeExisting(homedir())
      const canonicalCwd = await canonicalizeExisting(cwd)
      if (isSamePath(canonical, canonicalHome) || isSamePath(canonical, canonicalCwd)) {
        return {
          category: "Catastrophic recursive deletion target",
          matched: `target canonicalizes to ${isSamePath(canonical, canonicalHome) ? "the home directory" : "the active workspace"}: ${canonical}`,
          subject: command,
          hardBlock: true,
        }
      }
    }
  }

  return {
    category: "Recursive or bulk deletion",
    matched: recursiveMatch[0],
    subject: command,
  }
}
