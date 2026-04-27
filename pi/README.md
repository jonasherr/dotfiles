# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `APPEND_SYSTEM.md` → symlinked to `~/.pi/agent/APPEND_SYSTEM.md`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- `agents/` → symlinked to `~/.pi/agent/agents/`
- `prompts/` → symlinked to `~/.pi/agent/prompts/`
- `themes/` → symlinked to `~/.pi/agent/themes/`
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns.
- `extensions/terminal-notify.ts` mirrors the opencode terminal notification plugin for Kitty/meow: starts the sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
- `extensions/subagent/` adds a `subagent` tool for isolated user-level subagents. It supports single, parallel, and chained runs; parallel mode is read-only and blocks `patcher`.
- If no interactive UI is available, matching damage-control tool calls are blocked by default.

## Subagents

Subagents are optimized for parallel speed without bloating the main session context. They always run with `--no-session` and only load user-level agents from `~/.pi/agent/agents`.

Agents:

- `scout` — fast read-only reconnaissance with compact file/line handoff (`openai/gpt-5.4-mini`, minimal thinking).
- `planner` — read-only concrete planning (`openai/gpt-5.5`).
- `patcher` — focused write-capable implementation agent; not allowed in parallel (`openai/gpt-5.5`).
- `reviewer` — read-only independent diff/code review (`openai/gpt-5.5`).

Prompt templates:

- `/scout <task>` — run one or more scouts and synthesize.
- `/scout-and-plan <task>` — scout → planner.
- `/implement <task>` — scout → planner → patcher; main session handles diff inspection and verification.
- `/implement-and-review <task>` — scout → planner → patcher → reviewer.
- `/review-changes [focus]` — reviewer over current working tree changes.

Default behavior is injected via `APPEND_SYSTEM.md`: use subagents proactively when work can be parallelized, when reconnaissance would add too much context to the main session, or when an independent review is useful. The main pi session remains the manager and synthesizer.

## Skills

`~/.agents/skills` is the cross-agent source of truth.

- Pi scans `~/.agents/skills` natively and `settings.json` also points there explicitly.
- OpenCode uses `~/.config/opencode/skills/<name>` symlinks that point into `~/.agents/skills/<name>`.
- Claude Code uses `~/.claude/skills/<name>` symlinks that point into `~/.agents/skills/<name>`.
- Public, committed skills still live in `~/Projects/dotfiles/opencode/skills`; `~/.agents/skills/<name>` points to those directories.
- Private/internal skills live directly in `~/.agents/skills/<name>` or point to their external source checkout.

This avoids duplicate pi skill discovery while keeping all agents on the same skill set.

### Adding a skill

Add or install it under `~/.agents/skills/<skill-name>/SKILL.md`, then symlink it into agent-specific dirs if that agent does not scan `~/.agents/skills` directly.

For public skills committed to this repo, add them under `opencode/skills/<skill-name>/SKILL.md` and create `~/.agents/skills/<skill-name>` as a symlink to that directory.
