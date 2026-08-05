# pi

Config for [pi](https://github.com/badlogic/pi-coding-agent).

## Layout

- `settings.json` → symlinked to `~/.pi/agent/settings.json`
- `APPEND_SYSTEM.md` → symlinked to `~/.pi/agent/APPEND_SYSTEM.md`
- `extensions/` → symlinked to `~/.pi/agent/extensions/`
- `prompts/` → symlinked to `~/.pi/agent/prompts/`
- `themes/` → symlinked to `~/.pi/agent/themes/`
- `skills/` → committed skills, including Jonas-authored and reviewed vendored skills, exposed through `~/.agents/skills/`
- `skills.public.json` → source manifest for public skills installed directly into `~/.agents/skills` with the skills CLI.
- `install-skills.sh` → refreshes shared skill symlinks and cleans up old skill links.
- Runtime state (sessions, caches) stays in `~/.pi/agent/` and is **not** tracked here.

## Extensions

- `extensions/damage-control.ts` prompts for human approval before pi runs commands or file operations matching dangerous, destructive, secret-access, or exfiltration patterns. It hard-blocks recursive deletion aimed at root, home, the active workspace, aliases resolving to those locations, or targets widened by non-fail-closed shell variables.
- `extensions/terminal-notify.ts` starts the Kitty/meow sidebar daemon when needed and sends Kitty/sidebar plus macOS desktop notifications when pi is idle, asking a question, or waiting for damage-control approval.
- `extensions/subagent/` adds a generic `subagent` tool that spawns isolated `pi -p --no-session` background agents. It supports single and parallel runs, always requests `xhigh` thinking, and keeps model selection in the parent orchestrator. Tasks are read-only by default, and matching damage-control checks request approval through the parent UI.
- If no interactive UI is available, matching damage-control tool calls are blocked by default.

## Subagents

The `subagent` tool is intentionally small: it starts one or more disposable `pi -p --no-session` processes and returns compact, evidence-based handoffs. For substantial work, the parent session acts as an orchestrator. It delegates most independent reading and research, focused implementation, and verification, parallelizes independent tracks early, then evaluates the handoffs and owns final synthesis. It should not repeat delegated reconnaissance. Small tasks and tightly sequential work stay in the parent.

There are no specialized subagent personas or prompt templates. The tool takes either a single `task` or a parallel `tasks` array. By default, subagents get read-only tools: `read`, `grep`, `find`, `ls`, and `bash`. Set `readOnly: false` or pass explicit `tools` only for focused edits with clear ownership.

Model selection remains orchestrator policy:

- `openai/gpt-5.6-sol`: highest-stakes, ambiguous, long-horizon work.
- `openai/gpt-5.6-terra`: bounded engineering, implementation, and debugging.
- `openai/gpt-5.6-luna`: mechanical or high-volume evidence gathering and transformation.
- `zai/glm-5.2`: independent challenge, critique, and review.
- `moonshotai/kimi-k3`: huge or multimodal corpora.
- `anthropic/claude-opus-5`: prose and final drafting.

Use model diversity only when it adds an independent perspective. Every subagent invocation requests `--thinking xhigh`; providers may map or clamp unsupported levels. The thinking level is not configurable through the tool input.

## Prompt templates

- `/plan [task]` inspects the codebase, uses parallel reconnaissance where useful, then follows the round-based `grilling` skill to resolve consequential ambiguity before producing an implementation-ready plan.

## Engineering workflow skills

- `wayfinder` maps large, uncertain efforts as tracker-backed decision tickets with explicit fog, dependencies, and an actionable frontier.
- `improve-codebase-architecture` scans active code for opportunities to deepen modules, presents a visual report, then grills through the selected candidate.
- `implement` implements a spec or ticket using TDD at agreed seams, runs focused and full verification, invokes `code-review`, and commits the completed work.
- `code-review` reviews a fixed diff independently against repository standards and the originating spec.
- `handoff` compacts work for another session. The local adaptation returns immediate handoffs in chat and uses managed workspaces or active tracker tickets for files instead of unmanaged OS temp paths.
- `setup-matt-pocock-skills` configures the per-repository issue tracker and domain-documentation conventions required by Wayfinder and related engineering skills.

## Skills

`~/.agents/skills` is the shared runtime registry. Committed skills live in `pi/skills/`, and `~/.agents/skills/<name>` points to those directories. This includes Jonas-authored skills and reviewed vendored skills such as d3k. Public skills from skills.sh and private/internal skills live directly in `~/.agents/skills/<name>` or point to their external source checkout.

Pi scans only `~/.agents/skills` via `settings.json`. Claude Code compatibility links can still point at `~/.agents/skills/<name>`.

Public skills installed from skills.sh are recorded in `pi/skills.public.json` and installed directly into `~/.agents/skills` with the skills CLI. Private/internal skills stay out of dotfiles and are managed by the global skills CLI lockfile at `~/.agents/.skill-lock.json` or by symlinks to private checkouts.

### Adding a skill

Add committed skills under `pi/skills/<skill-name>/SKILL.md`, then run:

```sh
./pi/install-skills.sh
```

Add public skills from skills.sh with the install commands in `pi/skills.public.json`. Install or copy private skills into `~/.agents/skills/<skill-name>`.

The vendored `d3k` skill comes from `vercel-labs/dev3000` release `v0.0.178`. Its runtime requires Node.js 24 and is installed separately with `bun install -g dev3000@0.0.178 --registry https://registry.npmjs.org`; the macOS dependency installer provisions both.
