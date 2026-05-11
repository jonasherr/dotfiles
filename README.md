# Dotfiles

macOS dotfiles for my development environment. Each tool lives in its own directory with a `links.prop` file that declares where its config gets symlinked.

## What's in here

| Directory | What |
|-----------|------|
| `aerospace/` | AeroSpace tiling window manager |
| `kanata/` | Kanata keyboard remapping |
| `kitty/` | Kitty terminal |
| `lazygit/` | LazyGit TUI |
| `leaderkey/` | LeaderKey launcher |
| `mouseless/` | Mouseless keyboard-driven mouse replacement |
| `nvim/` | Neovim (Lua, lazy.nvim) |
| `pi/` | pi coding agent config and shared public skills |
| `claude/` | Claude Code config |
| `gh-dash/` | GitHub Dashboard TUI |
| `raycast/` | Raycast config |
| `sketchybar/` | SketchyBar status bar |
| `television/` | Television fuzzy finder |
| `yazi/` | Yazi file manager |
| `zsh/` | Zsh shell config |
| `brew/` | Homebrew bundle |
| `scripts/` | Utility scripts |

## Install

```sh
git clone https://github.com/jonasherr/dotfiles.git
cd dotfiles
./install/bootstrap.sh
```

This symlinks everything declared in `links.prop` files and creates `~/.env.sh` with `$DOTFILES` pointing to the repo.

To install a single tool:

```sh
./install/bootstrap.sh kanata
```

## Local config

Machine-specific shell config goes in `~/.env.sh` — it's loaded near the top of `.zshrc` and not committed to the repo.

