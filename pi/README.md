# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `APPEND_SYSTEM.md` → symlinked to `~/.pi/agent/APPEND_SYSTEM.md`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- `themes/` → symlinked to `~/.pi/agent/themes/`
- `skills/` → committed public skills, exposed through `~/.agents/skills/`
- `install-skills.sh` → refreshes shared skill symlinks and cleans up old skill links.
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns.
- `extensions/terminal-notify.ts` starts the Kitty/meow sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
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

`~/.agents/skills` is the shared runtime registry. Public, committed skills live in `pi/skills/`, and `~/.agents/skills/<name>` points to those directories. Private/internal skills can live directly in `~/.agents/skills/<name>` or point to their external source checkout.

Pi scans both `~/.agents/skills` and `~/Projects/dotfiles/pi/skills` via `settings.json`. Claude Code compatibility links can still point at `~/.agents/skills/<name>`.

### Adding a skill

Add public skills under `pi/skills/<skill-name>/SKILL.md`, then run:

```sh
./pi/install-skills.sh
```

Install or copy private skills into `~/.agents/skills/<skill-name>`.
