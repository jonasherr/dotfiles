# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns.
- `extensions/terminal-notify.ts` mirrors the opencode terminal notification plugin for Kitty/meow: starts the sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
- If no interactive UI is available, matching tool calls are blocked by default.

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
