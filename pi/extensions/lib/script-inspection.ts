import { open, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

import { isSecretPath } from "./bash-risk.ts"
import { directoryAt } from "./damage-control-safety.ts"
import {
  commandWordIndex,
  executableName,
  parseShell,
  type ShellWord,
} from "./shell-inert-text.ts"

export type ReferencedScript = {
  /** Human label, e.g. "cleanup.sh" or "package.json script \"clean\"". */
  label: string
  /** Shell source to inspect as if it were the command. */
  content: string
  /** Directory the script's commands run in. */
  cwd: string
}

export type ScriptReferences = {
  scripts: ReferencedScript[]
  /** Script files that exist but could not be read or are too large (> 256 KB). */
  uninspectable: string[]
}

const MAX_SCRIPT_SIZE = 256 * 1024
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"])
const PATH_SHELL_EXTENSIONS = /\.(?:sh|bash|zsh)$/i
// Workspace-wide runs cannot be resolved to one package.json, so they are skipped.
const WORKSPACE_FLAGS = new Set(["-r", "--recursive", "--filter", "-F", "--workspace", "-w", "--workspaces", "-ws"])
// `pnpm --dir sub run x`, `npm --prefix sub run x`, `yarn --cwd sub x`, `bun --cwd sub run x`.
const DIRECTORY_FLAGS = new Set(["-C", "--dir", "--prefix", "--cwd"])

const NPM_BUILTINS = new Set([
  "install", "i", "ci", "add", "uninstall", "remove", "rm", "update", "up", "exec", "x",
  "publish", "pack", "link", "ls", "list", "outdated", "audit", "view", "info", "init",
  "config", "cache", "version", "whoami", "login", "logout", "dedupe", "prune", "rebuild",
  "doctor", "explain", "why", "fund", "help",
])
const PNPM_BUILTINS = new Set([
  "add", "install", "i", "update", "up", "upgrade", "remove", "rm", "uninstall", "link",
  "unlink", "import", "rebuild", "prune", "fetch", "patch", "patch-commit", "audit", "list",
  "ls", "outdated", "why", "licenses", "exec", "dlx", "create", "init", "publish", "pack",
  "store", "env", "setup", "config", "bin", "root", "deploy", "doctor", "server", "dedupe",
  "approve-builds", "ignored-builds", "self-update", "help",
])
const YARN_BUILTINS = new Set([
  "add", "install", "remove", "upgrade", "up", "dlx", "exec", "info", "init", "link", "unlink",
  "npm", "pack", "patch", "patch-commit", "why", "workspaces", "workspace", "config", "cache",
  "constraints", "set", "version", "plugin", "bin", "node", "explain", "rebuild", "stage", "help",
  "global",
])

function expandHome(path: string): string {
  if (path === "~") return homedir()
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2))
  return path
}

function isOption(value: string): boolean {
  return value.startsWith("-")
}

/**
 * The package directory a package-manager command runs in, and its remaining
 * words. Undefined for workspace-wide runs or directories that are not literal.
 */
function packageInvocation(args: readonly ShellWord[], cwd: string): { directory: string; words: string[] } | undefined {
  const values = args.map(({ value }) => value)
  let directory = cwd
  const words: string[] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const equals = value.startsWith("--") ? value.indexOf("=") : -1
    const flag = equals > 0 ? value.slice(0, equals) : value
    if (WORKSPACE_FLAGS.has(flag)) return undefined
    if (DIRECTORY_FLAGS.has(flag)) {
      const target = equals > 0 ? value.slice(equals + 1) : values[++index]
      if (!target || /[`$*?{}[\]]/.test(target)) return undefined
      directory = resolve(directory, expandHome(target))
      continue
    }
    words.push(value)
  }
  return { directory, words }
}

function isShellCommand(name: string): boolean {
  return SHELLS.has(name)
}

function shellScriptArgument(args: readonly string[]): string | undefined {
  let index = 0
  while (index < args.length) {
    const value = args[index]
    if (value === "--") return args[index + 1]
    if (!isOption(value) || value === "-") return value === "-" ? undefined : value
    if (value === "-o" || value === "-O" || value === "--rcfile" || value === "--init-file") {
      index += 2
      continue
    }
    if (value.startsWith("--")) {
      index += 1
      continue
    }
    if (value.slice(1).includes("c") || value.slice(1).includes("s")) return undefined
    index += 1
  }
  return undefined
}

function isShellShebang(line: string): boolean {
  const match = line.match(/^#!\s*(?:\/usr\/bin\/env\s+(?:-S\s+)?(?:\S+\s+)*|\S+\/)?(bash|sh|zsh|dash|ksh)(?:\s|$)/)
  return match !== null
}

function firstLine(content: string): string {
  return content.slice(0, content.indexOf("\n") < 0 ? content.length : content.indexOf("\n"))
}

async function readScript(
  path: string,
  label: string,
  cwd: string,
  results: ScriptReferences,
  seenPaths: Set<string>,
): Promise<void> {
  const resolvedPath = resolve(cwd, expandHome(path))
  if (seenPaths.has(resolvedPath)) return
  seenPaths.add(resolvedPath)
  // `source .env` only loads variables. Never read secret files into findings.
  if (isSecretPath(resolvedPath)) return

  let fileStat
  try {
    fileStat = await stat(resolvedPath)
  } catch (error) {
    // Missing paths fail in the shell too, so they do not need a warning.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") {
      results.uninspectable.push(resolvedPath)
    }
    return
  }
  if (!fileStat.isFile()) return
  if (fileStat.size > MAX_SCRIPT_SIZE) {
    results.uninspectable.push(resolvedPath)
    return
  }

  try {
    const content = await readFile(resolvedPath, "utf8")
    results.scripts.push({ label, content, cwd })
  } catch {
    results.uninspectable.push(resolvedPath)
  }
}

async function inspectPathExecutable(
  path: string,
  cwd: string,
  results: ScriptReferences,
  seenPaths: Set<string>,
): Promise<void> {
  const resolvedPath = resolve(cwd, expandHome(path))
  if (seenPaths.has(resolvedPath)) return

  let fileStat
  try {
    fileStat = await stat(resolvedPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTDIR") results.uninspectable.push(resolvedPath)
    return
  }
  if (!fileStat.isFile()) return

  let prefix: Buffer
  try {
    const handle = await open(resolvedPath, "r")
    try {
      const buffer = Buffer.alloc(512)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      prefix = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch {
    results.uninspectable.push(resolvedPath)
    return
  }

  if (prefix.includes(0)) return
  const line = firstLine(prefix.toString("utf8"))
  const shellScript = line.startsWith("#!") ? isShellShebang(line) : PATH_SHELL_EXTENSIONS.test(path)
  if (!shellScript) return
  await readScript(path, path, cwd, results, seenPaths)
}

function packageScriptName(
  manager: string,
  words: readonly string[],
  packageScripts: Record<string, unknown>,
): string | undefined {
  // Leading options such as `npm --silent run lint` precede the subcommand.
  const firstWord = words.findIndex((word) => !isOption(word))
  const values = firstWord < 0 ? [] : words.slice(firstWord)

  if (manager === "bun") {
    if (values[0] !== "run" || !values[1] || !(values[1] in packageScripts)) return undefined
    return values[1]
  }

  if (manager === "npm") {
    if (values[0] === "run" || values[0] === "run-script") return values[1]
    if (["test", "start", "stop", "restart"].includes(values[0] ?? "")) return values[0]
    return undefined
  }
  if (manager === "pnpm") {
    if (values[0] === "run") return values[1]
    if (values[0] === "test" || values[0] === "start") return values[0]
    if (!values[0] || PNPM_BUILTINS.has(values[0])) return undefined
    return values[0]
  }
  if (manager === "yarn") {
    if (values[0] === "run") return values[1]
    if (!values[0] || YARN_BUILTINS.has(values[0])) return undefined
    return values[0]
  }
  return undefined
}

async function inspectPackageScript(
  manager: string,
  args: readonly ShellWord[],
  cwd: string,
  results: ScriptReferences,
  seenNames: Set<string>,
): Promise<void> {
  const invocation = packageInvocation(args, cwd)
  if (!invocation) return
  const { directory, words } = invocation

  let packageContent: string
  try {
    packageContent = await readFile(resolve(directory, "package.json"), "utf8")
  } catch {
    return
  }
  let packageJson: { scripts?: Record<string, unknown> }
  try {
    packageJson = JSON.parse(packageContent)
  } catch {
    return
  }
  const scripts = packageJson.scripts
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return

  const name = packageScriptName(manager, words, scripts)
  if (!name || !(name in scripts) || typeof scripts[name] !== "string") return

  // Lifecycle hooks are run with the requested script and need the same inspection.
  for (const scriptName of [`pre${name}`, name, `post${name}`]) {
    const content = scripts[scriptName]
    const key = `${directory}\0${scriptName}`
    if (typeof content !== "string" || seenNames.has(key)) continue
    seenNames.add(key)
    results.scripts.push({
      label: directory === cwd ? `package.json script "${scriptName}"` : `${directory}/package.json script "${scriptName}"`,
      content,
      // Package scripts run in their package directory.
      cwd: directory,
    })
  }
}

/** Finds shell files and package scripts directly referenced by a command. */
export async function referencedScripts(command: string, cwd: string): Promise<ScriptReferences> {
  const results: ScriptReferences = { scripts: [], uninspectable: [] }
  const parsed = parseShell(command)
  if (!parsed.confident) return results

  const seenPaths = new Set<string>()
  const seenNames = new Set<string>()
  const absoluteCwd = resolve(cwd)

  for (const segment of parsed.segments) {
    const commandIndex = commandWordIndex(segment.words)
    const commandWord = segment.words[commandIndex]?.value
    if (!commandWord) continue
    // `cd sub && ./x.sh` runs sub/x.sh. When a cd cannot be followed, the
    // script cannot be located, so it is left uninspected as before.
    const directory = directoryAt(parsed.source, segment.words[0].start, absoluteCwd)
    if (!directory) continue
    const name = executableName(commandWord)
    const args = segment.words.slice(commandIndex + 1)

    if (isShellCommand(name)) {
      const scriptPath = shellScriptArgument(args.map(({ value }) => value))
      if (scriptPath) await readScript(scriptPath, scriptPath, directory, results, seenPaths)
    } else if (name === "source" || commandWord === ".") {
      const scriptPath = args[0]?.value
      if (scriptPath) await readScript(scriptPath, scriptPath, directory, results, seenPaths)
    } else if (commandWord.includes("/")) {
      await inspectPathExecutable(commandWord, directory, results, seenPaths)
    } else if (["npm", "pnpm", "yarn", "bun"].includes(name)) {
      await inspectPackageScript(name, args, directory, results, seenNames)
    }

    if (results.scripts.length >= 10) break
  }

  return {
    scripts: results.scripts.slice(0, 10),
    uninspectable: [...new Set(results.uninspectable)],
  }
}
