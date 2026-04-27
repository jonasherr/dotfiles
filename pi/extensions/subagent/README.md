# Subagent extension

User-level subagents for pi with isolated context windows.

## Design choices

- Only loads agents from `~/.pi/agent/agents`.
- Project-local agents are intentionally disabled.
- Subagents run with `--no-session`.
- Parallel mode supports up to 8 tasks / 4 concurrent tasks.
- Parallel mode blocks write-capable agents (`patcher`).
- Agent frontmatter supports `model`, `thinking`, and `tools`.

## Agents

The tracked agents live in `pi/agents/` and are symlinked to `~/.pi/agent/agents`:

- `scout` — read-only compact recon.
- `planner` — read-only concrete plans.
- `patcher` — focused file edits, no commits.
- `reviewer` — read-only independent review.

## Prompts

The tracked prompt templates live in `pi/prompts/` and are symlinked to `~/.pi/agent/prompts`:

- `/scout`
- `/scout-and-plan`
- `/implement`
- `/implement-and-review`
- `/review-changes`
