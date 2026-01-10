# ~/.zshenv
# This file is sourced for ALL zsh shells (interactive and non-interactive)
# Essential for commands run by external tools like Raycast/leaderkey

# Dotfiles location
export DOTFILES="$HOME/Projects/dotfiles"

# Homebrew
export BIN_PATH="/opt/homebrew/bin"

# PATH configuration
export PATH="/opt/homebrew/bin:$PATH"
export PATH="$PATH:/usr/local/sbin:$DOTFILES/bin:$HOME/.local/bin:$DOTFILES/scripts/"
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"

# fnm
FNM_PATH="$HOME/Library/Application Support/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
fi

# LM Studio
export PATH="$PATH:$HOME/.lmstudio/bin"

# Notes directory
export NOTES="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes"


