# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `APPEND_SYSTEM.md` → symlinked to `~/.pi/agent/APPEND_SYSTEM.md`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- `themes/` → symlinked to `~/.pi/agent/themes/`
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns.
- `extensions/terminal-notify.ts` mirrors the opencode terminal notification plugin for Kitty/meow: starts the sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
- `extensions/subagent/` adds a generic `subagent` tool that spawns isolated `pi -p --no-session` background agents. It supports single and parallel runs. Tasks are read-only by default.
- If no interactive UI is available, matching damage-control tool calls are blocked by default.

## Subagents

The `subagent` tool is intentionally small: it starts one or more disposable `pi -p --no-session` processes and returns their compact output to the main session.

Use it for:

- Parallel read-only reconnaissance across independent areas.
- Independent checks that would add too much context to the main session.
- Focused background work when a separate context is helpful.

There are no specialized agent files or prompt templates. The tool takes either a single `task` or a parallel `tasks` array. By default, subagents get read-only tools: `read`, `grep`, `find`, `ls`, and `bash`. Set `readOnly: false` or pass explicit `tools` only when edits are intended.

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
