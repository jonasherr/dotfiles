# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `APPEND_SYSTEM.md` → symlinked to `~/.pi/agent/APPEND_SYSTEM.md`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- `prompts/` → symlinked to `~/.pi/agent/prompts/`
- `themes/` → symlinked to `~/.pi/agent/themes/`
- `skills/` → committed Jonas-authored skills, exposed through `~/.agents/skills/`
- `skills.public.json` → source manifest for public skills installed directly into `~/.agents/skills` with the skills CLI.
- `install-skills.sh` → refreshes shared skill symlinks and cleans up old skill links.
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns. It hard-blocks recursive deletion aimed at root, home, the active workspace, aliases resolving to those locations, or targets widened by non-fail-closed shell variables.
- `extensions/terminal-notify.ts` starts the Kitty/meow sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
- `extensions/subagent/` adds a generic `subagent` tool that spawns isolated `pi -p --no-session` background agents. It supports single and parallel runs. Tasks are read-only by default.
- If no interactive UI is available, matching damage-control tool calls are blocked by default.

## Subagents

The `subagent` tool is intentionally small: it starts one or more disposable `pi -p --no-session` processes and returns their compact output to the main session.

Use it for:

- Parallel read-only reconnaissance across independent areas.
- Independent checks that would add too much context to the main session.
- Focused background work when a separate context is helpful.

There are no specialized subagent personas or subagent prompt templates. The tool takes either a single `task` or a parallel `tasks` array. By default, subagents get read-only tools: `read`, `grep`, `find`, `ls`, and `bash`. Set `readOnly: false` or pass explicit `tools` only when edits are intended.

## Prompt templates

- `/plan [task]` inspects the codebase, uses parallel reconnaissance where useful, then follows the `grill-me` skill to resolve consequential ambiguity before producing an implementation-ready plan.
- `/prove [claim]` verifies an implementation with concrete evidence. Browser-facing work explicitly uses Playwright rather than treating a successful build as sufficient.
- `/review-verified [scope]` reviews changes, delegates independent verification of credible findings, and reports only actionable findings that survive verification.

## Skills

`~/.agents/skills` is the shared runtime registry. Jonas-authored skills live in `pi/skills/`, and `~/.agents/skills/<name>` points to those directories. Public skills from skills.sh and private/internal skills live directly in `~/.agents/skills/<name>` or point to their external source checkout.

Pi scans only `~/.agents/skills` via `settings.json`. Claude Code compatibility links can still point at `~/.agents/skills/<name>`.

Public skills installed from skills.sh are recorded in `pi/skills.public.json` and installed directly into `~/.agents/skills` with the skills CLI. Private/internal skills, such as `vercel/internal-agent-skills`, stay out of dotfiles and are managed by the global skills CLI lockfile at `~/.agents/.skill-lock.json` or by symlinks to private checkouts.

### Adding a skill

Add Jonas-authored skills under `pi/skills/<skill-name>/SKILL.md`, then run:

```sh
./pi/install-skills.sh
```

Add public skills from skills.sh with the install commands in `pi/skills.public.json`. Install or copy private skills into `~/.agents/skills/<skill-name>`.
