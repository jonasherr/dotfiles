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

Two locations are wired up:

| Location | Tracked in dotfiles? | Use for |
|----------|----------------------|---------|
| `~/Projects/dotfiles/opencode/skills` | ✅ yes | Public skills shared via this repo |
| `~/.config/opencode/skills`           | ❌ no  | Private skills (work-specific, secrets, customer data) |

Both are auto-shared with opencode since they live in opencode's skill dirs.

### Adding a private skill

Drop it in `~/.config/opencode/skills/<skill-name>/SKILL.md`. Pi will pick it up
automatically — no settings change needed.

If you'd rather keep private skills *only* visible to pi (not opencode), use
`~/.pi/agent/skills/` instead (pi's default location, already auto-discovered).
