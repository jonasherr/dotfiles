# ~/.zshenv
# This file is sourced for ALL zsh shells (interactive and non-interactive)
# Essential for commands run by external tools like Raycast/leaderkey

# Dotfiles location
export DOTFILES="$HOME/Projects/dotfiles"

# Homebrew
export BIN_PATH="/opt/homebrew/bin"

# PATH configuration
export PATH="/opt/homebrew/bin:$PATH"
export PATH="$PATH:/usr/local/sbin:$HOME/.local/bin:$DOTFILES/scripts/"
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

# Vercel repos (used by field-report and other agent skills)
export VERCEL_REPOS_PATH="$HOME/Projects/vercel/agent-help"

# Disable oh-my-openagent telemetry (PostHog, added in v3.17.2)
export OMO_SEND_ANONYMOUS_TELEMETRY=0

# Strava local CLI credentials, optional and stored outside the repo in 1Password
if command -v op >/dev/null 2>&1; then
  export STRAVA_CLIENT_ID="${STRAVA_CLIENT_ID:-$(op read 'op://Private/Strava API/client_id' 2>/dev/null || true)}"
  export STRAVA_CLIENT_SECRET="${STRAVA_CLIENT_SECRET:-$(op read 'op://Private/Strava API/client_secret' 2>/dev/null || true)}"
  export STRAVA_REFRESH_TOKEN="${STRAVA_REFRESH_TOKEN:-$(op read 'op://Private/Strava API/refresh_token' 2>/dev/null || true)}"
fi
