import { execFile } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { readdir, realpath } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type DestructiveShellRisk = {
  category: string
  matched: string
  subject: string
  hardBlock?: boolean
  remediation?: string
}

const TEMP_PATH = String.raw`(?:(?:\/private)?\/tmp|\$\{?TMPDIR\}?|(?:[^\s;&|<>"']+\/)*(?:tmp|temp)(?![A-Za-z0-9_-]))(?:\/[^\s;&|<>"']*)?`
const TEMP_PATH_PATTERN = new RegExp(TEMP_PATH, "i")
const TEMP_CREATION_PATTERNS: RegExp[] = [
  /\bmktemp\b/i,
  /\b(?:tempfile\.(?:TemporaryDirectory|NamedTemporaryFile|mkdtemp|mkstemp)|(?:fs|require\s*\(\s*["']fs["']\s*\))\.(?:mkdtemp|mkdtempSync)|Deno\.(?:makeTempDir|makeTempFile))\s*\(/i,
  new RegExp(String.raw`\bmkdir\b[^\n;&|]*${TEMP_PATH}`, "i"),
  new RegExp(String.raw`(?:^|[^<])>>?\s*${TEMP_PATH}(?=$|[\s;&|])`, "i"),
  new RegExp(
    String.raw`\btee\b(?:\s+-[^\s]+)*\s+${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:cp|mv|install)\b[^\n;&|]*\s${TEMP_PATH}\s*(?=$|[;&|])`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:curl|wget)\b[^\n;&|]*(?:\s(?:-o|--output|--output-document)(?:=|\s+))${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
  new RegExp(
    String.raw`(?:^|\s)(?:--outdir|--output-dir|--output-path|--outfile|--log-file|--target-dir)(?:=|\s+)${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
  new RegExp(String.raw`\bdd\b[^\n;&|]*\bof=${TEMP_PATH}(?=$|[\s;&|])`, "i"),
  new RegExp(
    String.raw`\b(?:truncate|fallocate)\b[^\n;&|]*\s${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:unzip\b[^\n;&|]*\s-d|tar\b[^\n;&|]*\s-C)\s+${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:fs|Deno)\.(?:writeFile|writeFileSync|writeTextFile|writeTextFileSync)\s*\(\s*["']${TEMP_PATH}`,
    "i",
  ),
  new RegExp(
    String.raw`\b[A-Za-z_][A-Za-z0-9_]*=${TEMP_PATH}(?=$|[\s;&|])`,
    "i",
  ),
]

// rm must start a command, optionally behind wrappers. Recursive flags must be
// whole option words, so hyphenated names like `pnpm-workspace.yaml` or
// `my-file-reader.ts` are not mistaken for `-r`.
const RM_COMMAND = String.raw`(?:^|[;&|(){}\n]|(?<![\w-])(?:then|do|else|sudo|doas|command|exec|env|nice|nohup|time|caffeinate)\s+)\s*(?:(?:sudo|doas|command|exec|env)(?:\s+-[^\s]+)*\s+)*\\?(?:\/[^\s;|&]+\/)?rm\s+`
const RECURSIVE_FLAG = String.raw`(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)(?=[\s;|&)]|$)`

// rimraf is always recursive. Match it as a command, not as `pnpm add rimraf`.
const RIMRAF_COMMAND = String.raw`(?:^|[;&|(){}\n])\s*(?:(?:npx|bunx)(?:\s+-[^\s]+)*\s+|(?:pnpm|yarn|bun)\s+(?:dlx\s+|exec\s+)?|npm\s+exec\s+(?:--\s+)?)?rimraf(?=\s|$)[^;|&\n]*`

type DeletionKind = "rm" | "find" | "other"

const RECURSIVE_DELETE: Array<{ kind: DeletionKind; pattern: RegExp }> = [
  {
    kind: "rm",
    pattern: new RegExp(String.raw`${RM_COMMAND}(?=(?:[^;|&\n]*\s)?${RECURSIVE_FLAG})[^;|&\n]*`, "i"),
  },
  { kind: "rm", pattern: new RegExp(RIMRAF_COMMAND, "i") },
  { kind: "find", pattern: /\bfind\b[^;|&\n]*(?:-delete\b|-exec(?:dir)?\s+(?:\/[^\s;|&]+\/)?rm\b)/i },
  {
    kind: "other",
    pattern: /\b(?:xargs\s+(?:-[^\s]+\s+)*(?:\/[^\s;|&]+\/)?rm|shutil\.rmtree|(?:fs\.|require\s*\(\s*["']fs["']\s*\)\.)(?:rm|rmSync)\s*\(|Deno\.remove\s*\(|Remove-Item\b[^;|&\n]*-Recurse)/i,
  },
  { kind: "other", pattern: /\brsync\b[^;|&\n]*--delete(?:-before|-during|-delay|-after|-excluded)?\b/i },
]

// Directories that standard tools regenerate, so deleting them loses nothing.
const REGENERABLE_DIRECTORIES = new Set([
  ".angular", ".astro", ".dart_tool", ".docusaurus", ".expo", ".gradle", ".mypy_cache", ".next",
  ".nox", ".nuxt", ".nyc_output", ".parcel-cache", ".pytest_cache", ".ruff_cache", ".svelte-kit",
  ".swc", ".tox", ".turbo", ".vite", "__pycache__", "DerivedData", "node_modules", "storybook-static",
])
// Output names that sometimes hold source. They only count as regenerable
// when Git ignores them.
const IGNORED_OUTPUT_DIRECTORIES = new Set([
  ".build", ".cache", ".output", ".terraform", ".venv", "_build", "build", "coverage", "dist", "out",
  "target", "tmp", "venv",
])
const DISPOSABLE_FILE_NAME = /^(?:\*\.(?:log|pyc|pyo|tsbuildinfo|orig|rej|swp)|\.DS_Store)$/

// Non-recursive rm through a glob, such as `rm -f *` or `rm src/*.ts`. Named
// files are intentional; globs of disposable artifacts like `*.log` are fine.
const RM_ANY = new RegExp(String.raw`${RM_COMMAND}[^;|&\n]*`, "i")
const GLOB = /[*?[]/
const DISPOSABLE_GLOB =
  /(?:^|\/)(?:[^/]*\.(?:log|tmp|bak|orig|rej|swp|swo|pyc|pyo|o|class|tsbuildinfo)|\.DS_Store)$/

const MOUNT_CLEANUP = /\b(?:mount\s+--bind|mount\s+-o\s+bind|unshare\b)/i
const SHELL_VARIABLE =
  /(^|[^\\])(?:\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]+\}|\()|`)/
const FAIL_CLOSED_VARIABLE = /\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/g

function shellWords(fragment: string): string[] {
  return fragment.match(/(?:"(?:\\.|[^"])*"|'[^']*'|\\.|[^\s])+/g) ?? []
}

function unquote(word: string): string {
  if (
    (word.startsWith("'") && word.endsWith("'")) ||
    (word.startsWith('"') && word.endsWith('"'))
  ) {
    return word.slice(1, -1)
  }
  return word
}

function rmTargets(fragment: string): string[] {
  const rmIndex = fragment.search(/\b(?:rm|rimraf)\b/i)
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
  return /^(?:~|~\/|\$HOME\/?|\$\{HOME\}\/?|\$\{HOME:\?[^}]*\}\/?)$/.test(
    target,
  )
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
      suffix.push(
        candidate.slice(parent.length + (parent.endsWith("/") ? 0 : 1)),
      )
      candidate = parent
    }
  }
}

function isSamePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right)
}

function isInside(root: string, path: string): boolean {
  const relation = relative(root, path)
  return relation !== "" && !relation.startsWith("..") && !isAbsolute(relation)
}

// A regenerable name only counts within the target itself. A project stored
// under ~/coverage/app is not an artifact just because of its ancestor.
function hasRegenerableSegment(path: string, base: string): boolean {
  const parts = isInside(base, path) ? relative(base, path).split(sep) : [basename(path)]
  return parts.some((part) => REGENERABLE_DIRECTORIES.has(part))
}

async function isGitIgnored(path: string): Promise<boolean> {
  try {
    // The trailing slash lets `dist/` patterns match even if the directory is missing.
    await execFileAsync("git", ["-C", dirname(path), "check-ignore", "-q", "--", `${basename(path)}/`], {
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

const LOCKFILE =
  /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/
const BUNDLED_FILE = /\.(?:min\.(?:js|css)|bundle\.js)$/

/**
 * True for lockfiles, bundles, and files inside regenerable or Git-ignored
 * output directories. Edits there are usually overwritten, but not destructive.
 */
export async function isGeneratedPath(path: string, cwd: string): Promise<boolean> {
  if (LOCKFILE.test(path) || BUNDLED_FILE.test(path)) return true
  const absolute = resolve(cwd, path.replace(/^~(?=\/|$)/, homedir()))
  const parts = absolute.split(sep)
  if (parts.some((part) => REGENERABLE_DIRECTORIES.has(part))) return true
  // `dist` or `build` can be source folders, so ask Git whether they are output.
  const output = parts.findIndex((part, index) => index < parts.length - 1 && IGNORED_OUTPUT_DIRECTORIES.has(part))
  return output >= 0 && (await isGitIgnored(parts.slice(0, output + 1).join(sep)))
}

async function isCacheDirectory(path: string): Promise<boolean> {
  const home = await canonicalizeExisting(homedir())
  return [join(home, "Library", "Caches"), join(home, ".cache")].some((root) => isInside(root, path))
}

function globSegmentPattern(segment: string): RegExp {
  let source = ""
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]
    const classEnd = char === "[" ? segment.indexOf("]", index + 2) : -1
    if (char === "*") source += "[^/]*"
    else if (char === "?") source += "[^/]"
    else if (classEnd > 0) {
      const body = segment.slice(index + 1, classEnd).replace(/\\/g, "\\\\")
      source += `[${body.startsWith("!") ? `^${body.slice(1)}` : body}]`
      index = classEnd
    } else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${source}$`)
}

/** Expands `*`, `?`, and `[...]` the way bash does. */
async function expandGlob(absolutePattern: string): Promise<string[]> {
  let paths = ["/"]
  for (const segment of absolutePattern.split("/").filter(Boolean)) {
    const next: string[] = []
    for (const base of paths) {
      if (!/[*?[]/.test(segment)) {
        next.push(join(base, segment))
        continue
      }
      const matcher = globSegmentPattern(segment)
      const entries = await readdir(base).catch(() => [] as string[])
      for (const entry of entries) {
        // Like bash, `*` does not match dotfiles unless the pattern starts with a dot.
        if (entry.startsWith(".") && !segment.startsWith(".")) continue
        if (matcher.test(entry)) next.push(join(base, entry))
      }
    }
    paths = next
  }
  return paths
}

/** True when deleting the target only removes output that tools regenerate. */
async function isRegenerableTarget(target: string, cwd: string, expandGlobs = true): Promise<boolean> {
  if (!target || /[`$]/.test(target) || target.split("/").includes("..")) return false
  const absolute = resolve(cwd, target.replace(/^~(?=\/|$)/, homedir()))
  const name = basename(absolute)
  if (/[*?[\]{}]/.test(target)) {
    // `packages/*/node_modules`: expand it now and check every match, because a
    // symlinked package would lead rm outside the workspace.
    if (!expandGlobs || /[{}]/.test(target) || target.endsWith("/") || !REGENERABLE_DIRECTORIES.has(name)) {
      return false
    }
    for (const match of await expandGlob(absolute)) {
      if (!(await isRegenerableTarget(match, cwd, false))) return false
    }
    return true
  }
  // Canonical paths catch symlinks such as `.next -> ~/important`: a path that
  // looks like it is inside the workspace must also resolve inside it.
  const canonical = await canonicalizeExisting(absolute)
  const canonicalCwd = await canonicalizeExisting(cwd)
  if (isInside(resolve(cwd), absolute) && !isInside(canonicalCwd, canonical)) return false
  if (hasRegenerableSegment(absolute, resolve(cwd)) && hasRegenerableSegment(canonical, canonicalCwd)) {
    return true
  }
  if (await isCacheDirectory(canonical)) return true
  return IGNORED_OUTPUT_DIRECTORIES.has(name) && basename(canonical) === name && (await isGitIgnored(canonical))
}

/** Text of the simple command starting at `start`, ending at an unquoted operator. */
function simpleCommandFrom(text: string, start: number): string {
  let quote: string | undefined
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === "\\") {
      index += 1
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (";|&\n".includes(char)) return text.slice(start, index)
  }
  return text.slice(start)
}

/**
 * Start paths of `find . -name node_modules -type d -prune -exec rm -rf {} +`
 * and similar artifact cleanups, or undefined when the find could delete more.
 */
function findArtifactStartPaths(command: string): string[] | undefined {
  const words = shellWords(command).map(unquote)
  let index = 1
  // Leading options. -L and -H follow symlinks out of the tree; BSD -f names a path.
  while (index < words.length && /^-(?:[HLPEXdsx]+|O\d|D|f)$/.test(words[index])) {
    if (/[LH]/.test(words[index]) || words[index] === "-f") return undefined
    index += words[index] === "-D" ? 2 : 1
  }
  const starts: string[] = []
  while (index < words.length && !/^(?:-|\(|!|\\\()/.test(words[index])) starts.push(words[index++])
  const safeStart = (start: string) =>
    !isAbsolute(start) && !start.startsWith("~") && !start.split("/").includes("..") && !/[`$*?[{]/.test(start)
  if (!starts.every(safeStart)) return undefined

  const expression = words.slice(index)
  // OR, NOT, and groups can widen the match; -follow leaves the tree.
  const widening = ["-o", "-or", "-not", "!", ",", "(", ")", "\\(", "\\)", "-follow"]
  if (expression.some((word) => widening.includes(word))) return undefined
  const names = expression.flatMap((word, position) =>
    word === "-name" || word === "-iname" ? [expression[position + 1] ?? ""] : [],
  )
  if (names.length !== 1) return undefined
  if (!REGENERABLE_DIRECTORIES.has(names[0]) && !DISPOSABLE_FILE_NAME.test(names[0])) return undefined

  const action = expression.findIndex((word) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(word))
  const paths = starts.length > 0 ? starts : ["."]
  if (expression[action] === "-delete") return action === expression.length - 1 ? paths : undefined
  if (expression[action] !== "-exec" && expression[action] !== "-execdir") return undefined
  const end = expression.findIndex((word, position) => position > action && ["+", ";", "\\;"].includes(word))
  const execWords = expression.slice(action + 1, end)
  const removesMatches =
    end === expression.length - 1 &&
    /(?:^|\/)rm$/.test(execWords[0] ?? "") &&
    execWords.slice(1).every((word) => word === "{}" || /^-[A-Za-z]+$/.test(word))
  return removesMatches ? paths : undefined
}

type Deletion = { kind: DeletionKind; fragment: string; command: string; index: number }

const CD_START = /(?:^|[;&|\n])\s*(?=cd(?:\s|$))/g
const CD_ARGUMENT = /^cd(?:\s+("(?:[^"\\]|\\.)*"|'[^']*'|[^\s;&|'"]+))?\s*(?:$|[;&|\n])/

/**
 * Directory a deletion at `index` runs in, following literal `cd` commands.
 * Undefined when it cannot be known (`cd -`, variables, subshells, pushd, or
 * anything that does not parse completely).
 */
export function directoryAt(command: string, index: number, cwd: string): string | undefined {
  const before = command.slice(0, index)
  if (!/(?:^|[;&|(){}\n])\s*(?:cd|pushd|popd)(?:\s|$)/.test(before)) return cwd
  if (/[(){}]|\b(?:pushd|popd)\b/.test(before)) return undefined
  let directory = cwd
  for (const match of before.matchAll(CD_START)) {
    const parsed = before.slice((match.index ?? 0) + match[0].length).match(CD_ARGUMENT)
    if (!parsed) return undefined
    const target = parsed[1] === undefined ? undefined : unquote(parsed[1])
    if (!target || target.startsWith("-") || /[`$*?{}[\]]/.test(target)) return undefined
    directory = resolve(directory, target.replace(/^~(?=\/|$)/, homedir()))
  }
  return directory
}

async function deletesOnlyRegenerableArtifacts(
  deletions: readonly Deletion[],
  normalizedCommand: string,
  cwd: string,
): Promise<boolean> {
  const home = await canonicalizeExisting(homedir())
  for (const deletion of deletions) {
    if (deletion.kind === "other") return false
    const directory = directoryAt(normalizedCommand, deletion.index, cwd)
    if (!directory) return false
    if (deletion.kind === "find") {
      const starts = findArtifactStartPaths(deletion.command)
      // A tree-wide find from / or home reaches far beyond one project.
      const canonical = await canonicalizeExisting(directory)
      if (!starts || canonical === "/" || isSamePath(canonical, home)) return false
      // A symlinked start path such as `linked/` would lead outside the tree.
      for (const start of starts) {
        const canonicalStart = await canonicalizeExisting(resolve(directory, start))
        if (!isSamePath(canonicalStart, canonical) && !isInside(canonical, canonicalStart)) return false
      }
      continue
    }
    const targets = rmTargets(deletion.fragment)
    if (targets.length === 0) return false
    for (const target of targets) {
      if (!(await isRegenerableTarget(target, directory))) return false
    }
  }
  return true
}

export const TEMPORARY_WORKSPACE_POLICY =
  "Use the current worktree by default for project work and ordinary temporary outputs. Prefer existing project-standard ignored paths such as node_modules, .next, coverage, test output, or an ignored artifacts directory. Do not copy the repository to a managed temporary workspace for ordinary inspection, edits, dependency installation, tests, downloads, or local runtime checks. Use temporary_workspace_create only when no suitable ignored destination exists or when isolation, guaranteed cleanup, sensitive data, or unusually large disposable output makes it worthwhile. Use an isolated worktree only when clean-checkout isolation is intentional. Prefer stdout or pipes when no output file is needed. Use the returned workspace path and autogenerated ID, move retained outputs elsewhere before temporary_workspace_delete, and do not create scratch files under /tmp, $TMPDIR, ./tmp, ./temp, or another ad hoc temporary path."

function temporaryWorkspaceRemediation() {
  return `${TEMPORARY_WORKSPACE_POLICY} If an external tool creates artifacts outside your control, report their paths.`
}

function isManagedTemporaryPath(path: string): boolean {
  if (!isAbsolute(path)) return false
  const canonical = resolve(path)
  const roots = [
    resolve(tmpdir(), "pi-managed-workspaces"),
    resolve("/tmp/pi-managed-workspaces"),
    resolve("/private/tmp/pi-managed-workspaces"),
  ]

  return roots.some((root) => {
    const relation = relative(root, canonical)
    if (
      !relation ||
      relation === ".." ||
      relation.startsWith(`..${sep}`) ||
      isAbsolute(relation)
    ) {
      return false
    }
    return /^workspace-[^/]+(?:\/|$)/.test(relation)
  })
}

export function detectTemporaryPathWrite(
  path: string,
): DestructiveShellRisk | undefined {
  if (isManagedTemporaryPath(path)) return undefined
  const match = path.match(TEMP_PATH_PATTERN)
  if (!match) return undefined

  return {
    category: "Unmanaged temporary file or directory creation",
    matched: match[0],
    subject: path,
    hardBlock: true,
    remediation: temporaryWorkspaceRemediation(),
  }
}

export function detectTemporaryShellWrite(
  command: string,
): DestructiveShellRisk | undefined {
  const normalizedCommand = command.replace(/\\\r?\n/g, "")
  const match = TEMP_CREATION_PATTERNS.map((pattern) =>
    normalizedCommand.match(pattern),
  ).find(Boolean)
  if (!match) return undefined

  const matched = match[0].trim()
  const pathMatch = matched.match(TEMP_PATH_PATTERN)?.[0]
  if (pathMatch && isManagedTemporaryPath(pathMatch)) return undefined
  return {
    category: "Unmanaged temporary file or directory creation",
    matched: pathMatch ?? matched,
    subject: command,
    hardBlock: true,
    remediation: temporaryWorkspaceRemediation(),
  }
}

export async function detectDestructiveShellRisk(
  command: string,
  cwd: string,
): Promise<DestructiveShellRisk | undefined> {
  // Bash removes escaped newlines before parsing. Do the same so a model cannot
  // split `rm` and `-rf` across lines to bypass preflight checks.
  const normalizedCommand = command.replace(/\\\r?\n/g, "")
  // Inspect every deletion, so a narrow first `rm` cannot hide a later one.
  const allMatches = (pattern: RegExp) => [...normalizedCommand.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))]
  const deletions: Deletion[] = RECURSIVE_DELETE.flatMap(({ kind, pattern }) =>
    allMatches(pattern).map((match) => ({
      kind,
      fragment: match[0],
      command: simpleCommandFrom(normalizedCommand, match.index ?? 0),
      index: match.index ?? 0,
    })),
  )
  const recursiveFragments = deletions.map(({ fragment }) => fragment)
  if (recursiveFragments.length === 0) {
    const globTarget = allMatches(RM_ANY)
      .flatMap((match) => rmTargets(match[0]))
      .find((target) => GLOB.test(target) && !DISPOSABLE_GLOB.test(target))
    if (globTarget) {
      return {
        category: "Bulk file deletion",
        matched: `rm removes every file matching ${globTarget}`,
        subject: command,
      }
    }
    if (
      MOUNT_CLEANUP.test(normalizedCommand) &&
      /\b(?:rm\s+|rmtree)/i.test(normalizedCommand)
    ) {
      return {
        category: "Mount or temporary-directory cleanup",
        matched:
          "mount/namespace setup combined with automatic or recursive cleanup",
        subject: command,
      }
    }
    return undefined
  }

  if (recursiveFragments.some(hasUnprotectedVariable)) {
    return {
      category: "Unsafe variable-expanded recursive deletion",
      matched:
        "recursive deletion target contains a shell variable without ${VAR:?message} fail-closed expansion",
      subject: command,
      hardBlock: true,
    }
  }

  const targets = recursiveFragments.flatMap(rmTargets)
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
      const expanded = target.startsWith("~/")
        ? resolve(homedir(), target.slice(2))
        : isAbsolute(target)
          ? target
          : resolve(cwd, target)
      const canonical = await canonicalizeExisting(expanded)
      const canonicalHome = await canonicalizeExisting(homedir())
      const canonicalCwd = await canonicalizeExisting(cwd)
      if (
        isSamePath(canonical, canonicalHome) ||
        isSamePath(canonical, canonicalCwd)
      ) {
        return {
          category: "Catastrophic recursive deletion target",
          matched: `target canonicalizes to ${isSamePath(canonical, canonicalHome) ? "the home directory" : "the active workspace"}: ${canonical}`,
          subject: command,
          hardBlock: true,
        }
      }
    }
  }

  // node_modules, .next, caches, and Git-ignored build output are regenerable.
  if (await deletesOnlyRegenerableArtifacts(deletions, normalizedCommand, cwd)) return undefined

  return {
    category: "Recursive or bulk deletion",
    matched: recursiveFragments.join(" ... "),
    subject: command,
  }
}
