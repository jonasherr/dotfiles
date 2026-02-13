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
├── links.prop               # Symlink definitions (bootstrap maps these to ~/.config/opencode/)
├── install.sh               # Homebrew install script for opencode + terminal-notifier
├── plugin/
│   └── sound-notification.ts  # Custom plugin: sound + notification on session idle
├── commands/
│   └── full-review.md       # Custom command: multi-dimensional code review
├── skills/                  # 18 installed agent skills (copy-mode installs)
│   ├── frontend-design/
│   ├── vercel-react-best-practices/
│   ├── skill-creator/
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
- `mcp`: MCP server configs (none currently — browser automation via agent-browser skill)
- `plugin`: Plugin load order (sound-notification → md-table-formatter → oh-my-opencode)
- `permission`: Granular bash command permissions (allow/ask/deny per command pattern)

### oh-my-opencode.json
Agent orchestration config defining:
- Specialized agents (Sisyphus, Oracle, Librarian, Explore, etc.)
- Task categories (visual-engineering, ultrabrain, quick, etc.)
- Model assignments per agent/category
- Git-master and other skill settings

## Testing (oh-my-opencode submodule only)

- **Framework**: Bun native test runner
- **Convention**: `*.test.ts` files alongside source
- **TDD mandatory**: RED → GREEN → REFACTOR
- **BDD comments**: `#given`, `#when`, `#then`
- **~193 test files**, 2 known flaky (ralph-loop CI timeout, session-state parallel pollution)
- Test behavior, not implementation. One assertion per test when possible.

## Skills Management

Skills are installed to `skills/` and symlinked to `~/.config/opencode/skills/`.

**Always use copy mode** — the default symlink mode creates relative links to `~/.agents/skills/` which break with this dotfiles symlink setup.

```bash
npx skills add <source> --skill <name> -a opencode    # select "Copy" when prompted
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
