# Subagent extension

Generic background agents for pi with isolated context windows.

The tool starts disposable `pi -p --no-session` processes. There are no specialized agent files or project-local agent discovery.

## Modes

- Single: `{ "task": "..." }`
- Parallel: `{ "tasks": [{ "task": "..." }, { "task": "..." }] }`

## Defaults

- Max 8 parallel tasks, 4 concurrent processes.
- Read-only by default with `read`, `grep`, `find`, `ls`, and `bash`.
- Set `readOnly: false` to allow `edit` and `write`.
- Optional per-task `cwd`, `model`, `thinking`, and `tools`.
- Damage-control checks still apply inside subagents. Matching calls request approval through the parent pi UI and fail closed if approval is unavailable.

## Example

```json
{
  "tasks": [
    { "task": "Inspect the subagent extension API and summarize the relevant files." },
    { "task": "Inspect the README and APPEND_SYSTEM subagent guidance." }
  ]
}
```
