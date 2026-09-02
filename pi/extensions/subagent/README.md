# Subagent extension

Generic background agents for pi with isolated context windows.

The tool starts disposable `pi -p --no-session` processes. There are no specialized agent files or project-local agent discovery. The parent session remains the orchestrator: it splits substantial work into independent tracks, delegates most reading, research, bounded implementation, and verification, then evaluates compact handoffs and owns the final synthesis. Small or tightly sequential work stays in the parent.

## Modes

- Single: `{ "task": "..." }`
- Parallel: `{ "tasks": [{ "task": "..." }, { "task": "..." }] }`

Start independent tracks in parallel early so the parent does not repeat their reconnaissance.

## Model routing

Model selection is orchestrator policy, not extension logic. Set `model` per task according to its shape:

- `openai/gpt-5.6-sol`: highest-stakes, ambiguous, long-horizon work.
- `openai/gpt-5.6-terra`: bounded engineering, implementation, and debugging.
- `openai/gpt-5.6-luna`: mechanical or high-volume evidence gathering and transformation.
- `moonshotai/kimi-k3`: huge or multimodal corpora.
- `anthropic/claude-opus-5`: prose and final drafting.

Use model diversity only when it adds an independent perspective. Set `thinking` per task: `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, or `"max"`. It defaults to `"low"`; start low and raise it only when task complexity warrants it. A provider may map or clamp unsupported thinking levels.

## Defaults

- Max 8 parallel tasks, 4 concurrent processes.
- Read-only by default with `read`, `grep`, `find`, `ls`, `bash`, and the managed `temporary_workspace_create`, `temporary_workspace_list`, and `temporary_workspace_delete` tools.
- Managed temporary workspace tools remain available when an explicit `tools` allowlist is provided.
- Set `readOnly: false` to additionally allow `edit` and `write` for focused, clearly owned changes.
- Optional per-task `cwd`, `model`, `thinking`, `tools`, and `isolation`.
- Damage-control checks still apply inside subagents. Matching calls request approval through the parent pi UI and fail closed if approval is unavailable.
- Handoffs should be compact and evidence-based, including relevant paths, verification, risks, and uncertainty.

## Worktree isolation

Write-enabled tasks can set `isolation` to `"worktree"` or `"auto"`. During this opt-in rollout, both values create a unique linked worktree from a clean `HEAD` and refuse to start if the primary checkout is dirty, the cwd is outside a Git repository, or setup fails. They never silently fall back to the primary checkout. Read-only tasks stay in the requested checkout.

The default remains `"none"`. Isolated worktrees are retained under `$HOME/.pi/agent/worktrees/` after success, failure, or cancellation. Results include the worktree path, branch, base commit, final dirty state, and manual inspection and removal commands. Inspect retained work before cleanup. Linked worktrees share Git objects, refs, remotes, config, hooks, stash, and credentials, so they are not security sandboxes.

## Example

```json
{
  "tasks": [
    {
      "task": "Implement the bounded extension changes and report paths plus checks.",
      "model": "openai/gpt-5.6-terra",
      "thinking": "low",
      "readOnly": false,
      "isolation": "worktree"
    }
  ]
}
```
