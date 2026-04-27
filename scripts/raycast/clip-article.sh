#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Clip Article
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 📰
# @raycast.argument1 { "type": "text", "placeholder": "URL (defaults to clipboard)", "optional": true }

# Documentation:
# @raycast.description Save an article URL as Markdown in Obsidian clippings
# @raycast.author jonas_herrmannsdorfer
# @raycast.authorURL https://raycast.com/jonas_herrmannsdorfer

set -euo pipefail

# Raycast runs scripts with a minimal environment. Load the dotfiles env when possible.
if [ -f "$HOME/.zshenv" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.zshenv"
fi

DOTFILES="${DOTFILES:-$HOME/Projects/dotfiles}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$DOTFILES/scripts:$HOME/.local/bin:$PATH"

# The clipper is a Node script. Raycast does not run an interactive shell, so fnm
# is not initialized unless we do it here.
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash --use-on-cd --log-level=quiet)"
elif [ -x "$HOME/.local/share/fnm/node-versions/v24.2.0/installation/bin/node" ]; then
  export PATH="$HOME/.local/share/fnm/node-versions/v24.2.0/installation/bin:$PATH"
fi

url="${1:-}"
if [ -z "$url" ]; then
  url="$(pbpaste | tr -d '\r' | awk '{$1=$1};1')"
fi

if [ -z "$url" ]; then
  echo "No URL provided. Paste a URL or pass one as the Raycast argument."
  exit 1
fi

"$DOTFILES/scripts/clip-article/clip-article.js" "$url"
