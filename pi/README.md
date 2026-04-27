# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

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
