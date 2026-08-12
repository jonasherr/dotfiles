import { execFile } from "node:child_process"
import { resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type DeploymentSafetyContext = {
  cwd: string
  interactive: boolean
}

export type RepositoryDeploymentState = {
  repositoryRoot: string
  deploymentDirectory: string
  revision: string
  branch?: string
  staged: number
  modified: number
  conflicted: number
  untracked: number
}

export type DeploymentSafety = {
  isProduction: boolean
  requiresApproval: boolean
  hardBlock: boolean
  remediation?: string
  state?: RepositoryDeploymentState
}

type Exec = (executable: string, args: string[], cwd: string) => Promise<string>

const defaultExec: Exec = async (executable, args, cwd) => {
  const { stdout } = await execFileAsync(executable, args, { cwd, shell: false })
  return stdout
}

function words(command: string | readonly string[]): string[] {
  if (typeof command !== "string") return [...command]
  if (/[;&|`$()<>]/.test(command)) return []
  return command.match(/(?:"(?:\\.|[^"])*"|'[^']*'|\\.|[^\s])+/g)?.map((word) =>
    (word.startsWith("\"") && word.endsWith("\"")) || (word.startsWith("'") && word.endsWith("'"))
      ? word.slice(1, -1)
      : word,
  ) ?? []
}

function vercelArgumentIndex(args: readonly string[]): number {
  return args.findIndex((arg, index) => {
    const executable = arg.split("/").at(-1)
    if (executable !== "vercel" && executable !== "vc") return false
    if (index === 0) return true
    const wrapper = args[0]?.split("/").at(-1)
    return wrapper === "npx" || wrapper === "pnpm" || wrapper === "yarn"
  })
}

export function isProductionVercelDeployment(command: string | readonly string[]): boolean {
  const args = words(command)
  const executableIndex = vercelArgumentIndex(args)
  if (executableIndex < 0) return false
  return args.slice(executableIndex + 1).some((arg) => arg === "--prod" || arg === "--prod=true")
}

export function resolveDeploymentDirectory(command: string | readonly string[], cwd: string): string {
  const args = words(command)
  const executableIndex = vercelArgumentIndex(args)
  if (executableIndex < 0) return resolve(cwd)
  const vercelArgs = args.slice(executableIndex + 1)
  for (let index = 0; index < vercelArgs.length; index += 1) {
    if ((vercelArgs[index] === "--cwd" || vercelArgs[index] === "-C") && vercelArgs[index + 1]) return resolve(cwd, vercelArgs[index + 1])
    if (vercelArgs[index].startsWith("--cwd=")) return resolve(cwd, vercelArgs[index].slice("--cwd=".length))
  }
  const positional = vercelArgs.find((arg) =>
    arg !== "deploy" && arg !== "--prod" && arg !== "--prod=true" && !arg.startsWith("-"),
  )
  return positional ? resolve(cwd, positional) : resolve(cwd)
}

function countStatus(status: string): Pick<RepositoryDeploymentState, "staged" | "modified" | "conflicted" | "untracked"> {
  const result = { staged: 0, modified: 0, conflicted: 0, untracked: 0 }
  for (const entry of status.split("\0")) {
    if (!entry) continue
    const xy = entry.slice(0, 2)
    if (xy === "??") {
      result.untracked += 1
    } else if (/[U]/.test(xy) || ["AA", "DD"].includes(xy)) {
      result.conflicted += 1
    } else {
      if (xy[0] !== " ") result.staged += 1
      if (xy[1] !== " ") result.modified += 1
    }
  }
  return result
}

export async function inspectProductionDeployment(
  command: string | readonly string[],
  context: DeploymentSafetyContext,
  execute: Exec = defaultExec,
): Promise<DeploymentSafety> {
  if (!isProductionVercelDeployment(command)) return { isProduction: false, requiresApproval: false, hardBlock: false }
  const deploymentDirectory = resolveDeploymentDirectory(command, context.cwd)
  try {
    const root = (await execute("git", ["rev-parse", "--show-toplevel"], deploymentDirectory)).trim()
    const [status, branch, revision] = await Promise.all([
      execute("git", ["status", "--porcelain=v1", "-z"], deploymentDirectory),
      execute("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], deploymentDirectory).catch(() => ""),
      execute("git", ["rev-parse", "HEAD"], deploymentDirectory),
    ])
    const counts = countStatus(status)
    const dirty = Object.values(counts).some(Boolean)
    const state: RepositoryDeploymentState = {
      repositoryRoot: root,
      deploymentDirectory,
      revision: revision.trim(),
      branch: branch.trim() || undefined,
      ...counts,
    }
    return {
      isProduction: true,
      requiresApproval: dirty,
      hardBlock: false,
      state,
      remediation: dirty
        ? "Review the exact Git state and explicitly approve deployment from this source tree."
        : undefined,
    }
  } catch {
    return {
      isProduction: true,
      requiresApproval: true,
      hardBlock: !context.interactive,
      remediation: context.interactive
        ? "Git state could not be determined safely. Explicit approval is required before production deployment."
        : "Git state could not be determined safely in a noninteractive child; production deployment is blocked.",
    }
  }
}
