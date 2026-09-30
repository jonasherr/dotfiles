// The complete bash tool-call inspection: decides whether a command runs,
// needs human approval, or is blocked. damage-control.ts only maps the
// decision onto pi's approval UI, so this pipeline stays testable.

import { detectBashRisk } from "./bash-risk.ts"
import { detectDestructiveShellRisk, detectTemporaryShellWrite } from "./damage-control-safety.ts"
import { inspectProductionDeployment, type RepositoryDeploymentState } from "./deployment-safety.ts"
import {
  classifyGitCommand,
  detectDestructiveGitOperation,
  detectGitPathspecCwdMistake,
  extractGitInvocationsFromShell,
  hasUninspectableGitShell,
} from "./git-command-safety.ts"
import { referencedScripts } from "./script-inspection.ts"
import { maskInertShellText } from "./shell-inert-text.ts"

export type InspectionRisk = {
  category: string
  matched: string
  subject: string
  remediation?: string
}

export type BashInspection =
  | { decision: "allow"; notes: string[] }
  | { decision: "ask" | "block"; risk: InspectionRisk; notes: string[] }

export type BashInspectionContext = {
  cwd: string
  /** A human can answer approval prompts. */
  interactive: boolean
  /** Primary checkout when the command runs in an isolated worktree task. */
  primaryCheckout?: string
}

type ScriptState = { depth: number; visited: Set<string> }
type Finding = Omit<InspectionRisk, "subject">

// Scripts that call scripts are followed this many levels deep.
const MAX_SCRIPT_DEPTH = 3
const CHANGES_DIRECTORY = /(?:^|[;&|(){}\n])\s*(?:cd|pushd|popd)(?:\s|$)/
const REDIRECTED_GIT = /(?:^|\s)(?:-C|--git-dir|--work-tree)(?:\s|=|$)/
// Environment overrides point Git at another repository just like -C does.
const REDIRECTED_GIT_ENVIRONMENT = /(?:^|[\s;&|(])GIT_(?:DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY)=/

export function formatDeploymentState(state: RepositoryDeploymentState): string {
  const revision = state.branch ?? `detached at ${state.revision.slice(0, 12)}`
  return [
    `repository: ${state.repositoryRoot}`,
    `source: ${revision}`,
    `deployment directory: ${state.deploymentDirectory}`,
    `changes: staged ${state.staged}, modified ${state.modified}, conflicted ${state.conflicted}, untracked ${state.untracked}`,
  ].join("\n")
}

/** Inspects a bash command and every shell or package script it runs. */
export async function inspectBashCommand(
  command: string,
  context: BashInspectionContext,
): Promise<BashInspection> {
  return inspect(command, context, { depth: 0, visited: new Set() })
}

async function inspect(command: string, context: BashInspectionContext, state: ScriptState): Promise<BashInspection> {
  const notes: string[] = []
  const decide = (decision: "ask" | "block", finding: Finding): BashInspection => ({
    decision,
    risk: { ...finding, subject: command },
    notes,
  })
  // Search patterns, commit messages, comments, and heredoc documents are
  // text, not commands. Pattern checks only see executed shell code.
  const inspected = maskInertShellText(command)
  const nested = state.depth > 0

  // The temporary-workspace rule governs commands the agent writes, not
  // existing project scripts that happen to use mktemp.
  const temporaryWrite = nested ? undefined : detectTemporaryShellWrite(inspected)
  if (temporaryWrite) return decide("block", temporaryWrite)

  const destructive = await detectDestructiveShellRisk(inspected, context.cwd)
  if (destructive) return decide(destructive.hardBlock ? "block" : "ask", destructive)

  const gitInvocations = extractGitInvocationsFromShell(inspected)
  for (const invocation of gitInvocations) {
    const operation = detectDestructiveGitOperation(invocation, { cwd: context.cwd })
    if (operation) {
      return decide("ask", {
        category: "Destructive Git operation",
        matched: `${operation.operation}: ${operation.reason}`,
      })
    }
  }

  const risk = detectBashRisk(command, context.cwd, inspected)
  if (risk) return decide("ask", risk)

  const deployment = await inspectProductionDeployment(command, {
    cwd: context.cwd,
    interactive: context.interactive,
  })
  if (deployment.isProduction && deployment.hardBlock) {
    return decide("block", {
      category: "Production deployment blocked",
      matched: deployment.remediation ?? "Production deployment source state is unsafe",
      remediation: deployment.remediation,
    })
  }
  if (deployment.isProduction && deployment.requiresApproval) {
    return decide("ask", {
      category: "Production deployment source state",
      matched: deployment.state
        ? formatDeploymentState(deployment.state)
        : (deployment.remediation ?? "Git state could not be determined"),
    })
  }

  if (hasUninspectableGitShell(inspected)) {
    return decide("ask", {
      category: "Uninspectable Git shell syntax",
      matched: "Git appears inside unsupported or malformed shell syntax",
    })
  }

  // A root-relative pathspec from a nested directory silently matches nothing.
  // That is misleading, not destructive, so the model gets a note instead.
  // After cd the directory Git runs in is unclear, so there is no note.
  if (!nested && !CHANGES_DIRECTORY.test(inspected)) {
    for (const invocation of gitInvocations) {
      const warning = await detectGitPathspecCwdMistake(invocation, { cwd: context.cwd })
      if (warning) {
        notes.push(
          `[damage-control] Note: Git pathspec "${warning.path}" does not exist relative to ${context.cwd}, so Git may report nothing for it. ${warning.remediation}`,
        )
        break
      }
    }
  }

  const gitRisk = gitApprovalRisk(inspected, gitInvocations, context)
  if (gitRisk) return decide("ask", gitRisk)

  const scriptResult = await inspectReferencedScripts(command, context, state)
  if (scriptResult) return { ...scriptResult, notes }
  return { decision: "allow", notes }
}

function gitApprovalRisk(
  inspected: string,
  invocations: readonly string[],
  context: BashInspectionContext,
): Finding | undefined {
  const isolatedTask = Boolean(context.primaryCheckout)
  // An isolated task may change its own worktree freely. Linked worktrees
  // share refs, stash, and config, so those still ask, and so does anything
  // whose directory is unclear after cd or points elsewhere with -C.
  const unclearDirectory = CHANGES_DIRECTORY.test(inspected) || REDIRECTED_GIT_ENVIRONMENT.test(inspected)
  for (const invocation of invocations) {
    const safety = classifyGitCommand(invocation, {
      cwd: context.cwd,
      primaryCheckout: context.primaryCheckout,
      isolatedTask,
    })
    const mutation = safety.effect !== "read-only"
    const needsApproval =
      safety.effect === "external-or-remote-mutation" ||
      safety.effect === "unknown" ||
      (safety.targetsPrimaryCheckout && mutation) ||
      (isolatedTask && safety.effect === "local-repository-mutation") ||
      (isolatedTask && mutation && (unclearDirectory || REDIRECTED_GIT.test(invocation)))
    if (needsApproval) {
      return {
        category: "Git command requires approval",
        matched: `${safety.effect}: ${safety.remediation}`,
      }
    }
  }
  return undefined
}

/** Runs the same inspection on shell files and package scripts the command executes. */
async function inspectReferencedScripts(
  command: string,
  context: BashInspectionContext,
  state: ScriptState,
): Promise<Exclude<BashInspection, { decision: "allow" }> | undefined> {
  if (state.depth >= MAX_SCRIPT_DEPTH) return undefined
  // Oversized scripts are skipped rather than asked about: they are usually
  // generated (autoconf's ./configure), and unreadable scripts cannot run.
  const { scripts } = await referencedScripts(command, context.cwd)
  for (const script of scripts) {
    const key = `${script.cwd}\0${script.label}`
    if (state.visited.has(key)) continue
    state.visited.add(key)
    const result = await inspect(script.content, { ...context, cwd: script.cwd }, {
      depth: state.depth + 1,
      visited: state.visited,
    })
    if (result.decision === "allow") continue
    // Findings inside existing scripts always go to a human instead of being
    // hard-blocked: the script may be legitimate project tooling.
    return {
      decision: "ask",
      risk: {
        ...result.risk,
        category: `${result.risk.category} (in ${script.label})`,
        subject: command,
      },
      notes: [],
    }
  }
  return undefined
}
