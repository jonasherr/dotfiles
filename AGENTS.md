# Dotfiles Repository - Agent Guidelines

macOS dotfiles: Neovim, Kanata, Kitty, Zsh, SketchyBar, and related tools.

## Critical Rules

- **macOS-only** - scripts use `afplay`, `system_profiler`, Homebrew
- **`$DOTFILES` env var** is set in `~/.env.sh` and used throughout

## Package Managers & Corepack

This system uses **corepack** to manage package managers. Corepack shims are installed in PATH (`/opt/homebrew/bin/pnpm`, `/opt/homebrew/bin/yarn`) — so `pnpm`, `yarn`, `npx`, and `npm` all route through corepack automatically.

- **Node version manager**: `fnm` (configured in `.zshenv` and `zsh.rc`)
- **pnpm/yarn**: Always go through corepack shims — do NOT install pnpm or yarn globally
- Use `pnpm` and `yarn` directly — the corepack shims handle version resolution per-project via `packageManager` field in `package.json`
- The zsh aliases (`alias pnpm="corepack pnpm"`) are redundant with the shims and only apply to interactive shells — agents should call `pnpm`/`yarn` directly

## Build & Verify Commands

```bash
# Lua formatting
stylua --config-path nvim/.stylua.toml nvim/

# Shell syntax check
bash -n path/to/script.sh

# Install/update all symlinks
./install/bootstrap.sh
```

## Directory → Language Map

| Directory | Language | Formatter |
|-----------|----------|-----------|
| kanata/ | Kanata KBD (S-expressions) | - |
| opencode/ | TypeScript (Bun) | - | See `opencode/AGENTS.md` |
| opencode/plugin/ | TypeScript | Prettier |
| nvim/lua/ | Lua | StyLua (see .stylua.toml) |
| yazi/ | Lua | StyLua |
| sketchybar/ | Bash | - |
| kitty/meow/ | Python | PEP 8 |

## Kanata Patterns

Edit `kanata/kanata.kbd` directly. Config uses S-expressions (Lisp-like syntax).

Key concepts:
- `defsrc` — which physical keys kanata intercepts
- `defalias` — named shortcuts for complex actions (tap-hold, layer switches)
- `deflayer` — layer definitions (`base`, `special`, `numbers`)

Kanata live-reloads on config change. Requires `sudo` on macOS (uses Karabiner driver).

## Neovim Patterns

Plugins auto-load from `nvim/lua/plugins/`. Subdirectories organize by category:
- `plugins/files/` - file management
- `plugins/git/` - git integration
- `plugins/external/` - external tool integration

Follow existing plugin structure - return a table with lazy.nvim spec.

## Symlinks System

Each tool directory has a `links.prop` file:
```
$DOTFILES/nvim=$HOME/.config/nvim
$DOTFILES/kanata=$HOME/.config/kanata
```

## Code Style Quick Reference

**TypeScript**: 2 spaces, no semicolons, double quotes for imports. Types in `types.ts`.

**Lua**: 2 spaces, single quotes preferred, omit call parentheses where possible.

**Bash**: 2 spaces, quote all variables (`"$VAR"`), use arrays for args (`"${arr[@]}"`).

**Python**: 4 spaces, double quotes, type hints encouraged.

## Commits

Format: `<area>: <description>`
Examples: `kanata: add vim layer`, `nvim: configure LSP for Go`
