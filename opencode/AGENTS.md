# OpenCode Configuration — Agent Guidelines

OpenCode AI agent configuration, symlinked to `~/.config/opencode/`. Part of a macOS dotfiles repo.

## What This Is

This directory configures [OpenCode](https://opencode.ai) with the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin for multi-model agent orchestration. It is **not** a standalone project — it's a dotfiles config directory.

## Structure

```
opencode/
├── opencode.jsonc           # Main OpenCode config (keybinds, models, providers, permissions)
├── oh-my-opencode.json      # Agent orchestration config (agents, categories, models)
├── package.json             # Dependencies: oh-my-opencode, md-table-formatter, plugin SDK
├── links.prop               # Per-file symlink definitions (bootstrap maps these to ~/.config/opencode/)
├── install.sh               # Homebrew install + skill symlinking setup
├── plugin/
│   └── sound-notification.ts  # Custom plugin: sound + notification on session idle
├── skills/                  # Public skills (committed, symlinked into ~/.config/opencode/skills/)
│   ├── full-review/
│   ├── vercel-react-best-practices/
│   ├── web-design-guidelines/
│   └── ...
└── oh-my-opencode/          # Git submodule — full TypeScript project (has its own AGENTS.md)
```

## Build & Verify Commands

This directory has **no build step** — it's configuration. But the oh-my-opencode submodule does:

```bash
# Oh-My-OpenCode subproject (run from opencode/oh-my-opencode/)
bun run typecheck                    # Type check
bun run build                        # ESM + declarations + schema
bun run rebuild                      # Clean + build
bun test                             # Run all tests (~193 files)
bun test src/path/file.test.ts       # Run single test file
bun test --grep "pattern"            # Run tests matching pattern

# Validate symlinks are correct
cat links.prop                       # Check what's mapped where

# Apply all dotfiles symlinks (from repo root)
./install/bootstrap.sh
```

## Code Style

### TypeScript (plugin/, oh-my-opencode/)

- **Runtime**: Bun (not Node). Use `bun run`, `bun build`, `bunx`
- **Types**: `bun-types` — never use `@types/node`
- **Module**: ESM only (`"type": "module"`)
- **Target**: ESNext, strict mode
- **Style**: 2 spaces, no semicolons, double quotes for imports
- **Naming**: kebab-case directories, `createXXXHook`/`createXXXTool` factories
- **Exports**: Barrel pattern via `index.ts`, explicit named exports
- **Validation**: Zod schemas for config (`src/config/schema.ts`)
- **Config format**: JSONC (comments and trailing commas allowed)

### Forbidden Patterns

| Pattern | Why |
|---------|-----|
| `as any`, `@ts-ignore`, `@ts-expect-error` | Type safety is non-negotiable |
| Empty `catch(e) {}` | Never swallow errors silently |
| `npm install`, `yarn add` | Bun only in oh-my-opencode |
| `@types/node` | Use `bun-types` |
| Direct `bun publish` | Publishing is CI-only (GitHub Actions) |
| Local version bumps | Managed by CI pipeline |
| Deleting failing tests | Fix the code, not the test |

## Key Config Files

### opencode.jsonc
Main OpenCode config. Notable sections:
- `model`: Default model (`vercel/anthropic/claude-opus-4.6`)
- `provider`: Vercel (cloud) + Ollama (local) model providers
- `mcp`: MCP server configs (none currently — browser automation via oh-my-opencode built-in playwright skill)
- `plugin`: Plugin load order (sound-notification → md-table-formatter → oh-my-opencode)
- `permission`: Granular bash command permissions (allow/ask/deny per command pattern)

### oh-my-opencode.json
Agent orchestration config defining:
- Specialized agents (Sisyphus, Oracle, Librarian, Explore, etc.)
- Task categories (visual-engineering, ultrabrain, quick, etc.)
- Model assignments per agent/category
- Git-master and other skill settings

### Available Models

To check which models are available on the Vercel AI Gateway:

```
GET https://ai-gateway.vercel.sh/v1/models
```

Use this endpoint to verify model IDs before adding them to `oh-my-opencode.json` or `opencode.jsonc`. Model IDs follow the format `vercel/<provider>/<model>` in config (e.g., `vercel/openai/gpt-5.4`).

## Testing (oh-my-opencode submodule only)

- **Framework**: Bun native test runner
- **Convention**: `*.test.ts` files alongside source
- **TDD mandatory**: RED → GREEN → REFACTOR
- **BDD comments**: `#given`, `#when`, `#then`
- **~193 test files**, 2 known flaky (ralph-loop CI timeout, session-state parallel pollution)
- Test behavior, not implementation. One assertion per test when possible.

## Skills Management

Skills are split between **public** (in dotfiles, committed) and **internal** (local-only).

### Architecture

- `dotfiles/opencode/skills/` — Public skills, committed to git
- `~/.config/opencode/skills/` — Real directory (NOT a symlink), contains:
  - Symlinks to each public skill from dotfiles (created by `install.sh`)
  - Internal skills installed directly (from `vercel/internal-agent-skills`)

### Public skills (in dotfiles)

Add new public skills directly to `opencode/skills/<name>/SKILL.md`.
After bootstrap, run `opencode/install.sh` to symlink them into the config dir.

### Internal skills (local-only)

Install from the private repo using copy mode:

```bash
npx skills add vercel/internal-agent-skills --skill <name> -a opencode    # select "Copy"
```

### General skill commands

```bash
npx skills find                                         # search available
npx skills check                                        # check for updates
npx skills update                                       # update all
npx skills init my-skill                                # create custom skill
```

Skills are directories with a `SKILL.md` containing YAML frontmatter:
```yaml
---
name: my-skill
description: What this skill does and when to use it
---
```

## Oh-My-OpenCode Submodule

The `oh-my-opencode/` directory is a **git submodule** with its own comprehensive `AGENTS.md`. When working inside it, defer to that file for:
- Project structure and where-to-look guide
- Factory patterns (`createXXXHook`, `createXXXTool`)
- Agent model assignments
- Complexity hotspots (files >600 lines)
- CI/CD pipeline details
- MCP architecture (three-tier: built-in, Claude Code compat, skill-embedded)

## Commits

Format: `opencode: <description>`

- Explain "why" not "what"
- Every commit must leave config in a valid state
- For oh-my-opencode changes: separate test from implementation commits
- Never use `--no-verify`

## Process

1. **Understand** — study existing patterns before changing anything
2. **Test** — write tests first for oh-my-opencode changes
3. **Implement** — minimal change to achieve the goal
4. **Verify** — `bun run typecheck && bun test` for submodule changes
5. **Max 3 attempts** per issue, then stop and reassess

