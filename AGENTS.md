# Dotfiles Repository - Agent Guidelines

macOS dotfiles: Neovim, Karabiner, Kitty, Zsh, SketchyBar, and related tools.

## Critical Rules

- **Never edit `karabiner.json` directly** - it's generated from TypeScript
- **Always run `yarn build`** in karabiner/ after modifying `.ts` files
- **macOS-only** - scripts use `afplay`, `system_profiler`, Homebrew
- **`$DOTFILES` env var** is set in `~/.env.sh` and used throughout

## Build & Verify Commands

```bash
# Karabiner - MUST run after any .ts changes
cd karabiner && yarn build

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
| karabiner/ | TypeScript | Prettier (see .prettierrc) |
| opencode/plugin/ | TypeScript | Prettier |
| nvim/lua/ | Lua | StyLua (see .stylua.toml) |
| yazi/ | Lua | StyLua |
| sketchybar/ | Bash | - |
| kitty/meow/ | Python | PEP 8 |

## Karabiner Patterns

Edit files in `karabiner/rules/` or `karabiner/rules/layers/`. Use utils from `karabiner/utils.ts`:

```typescript
// Layer-based key mapping
import { createLayerConverter } from "../../utils";
const convert = createLayerConverter(Layers.arrows);
convert("h", "left_arrow")

// Simultaneous key press
createCombinedKey(["j", "k"], "escape")

// Home row modifications
homeRowKey([{ key: "f", modifier: "left_shift" }], "left_control")
```

After creating a new rule file:
1. Export a `KarabinerRules` object
2. Import in `karabiner/rules.ts` and add to `rules` array
3. Run `yarn build`

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
$DOTFILES/karabiner/karabiner.json=$HOME/.config/karabiner/karabiner.json
```

## Code Style Quick Reference

**TypeScript**: 2 spaces, no semicolons, double quotes for imports. Types in `types.ts`.

**Lua**: 2 spaces, single quotes preferred, omit call parentheses where possible.

**Bash**: 2 spaces, quote all variables (`"$VAR"`), use arrays for args (`"${arr[@]}"`).

**Python**: 4 spaces, double quotes, type hints encouraged.

## Commits

Format: `<area>: <description>`
Examples: `karabiner: add vim layer`, `nvim: configure LSP for Go`
