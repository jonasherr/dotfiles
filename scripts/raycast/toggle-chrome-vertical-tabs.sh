#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Chrome Vertical Tabs
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🌐
# @raycast.packageName Chrome

# Documentation:
# @raycast.description Toggle Chrome's vertical tab strip between expanded and collapsed
# @raycast.author jonas_herrmannsdorfer
# @raycast.authorURL https://raycast.com/jonas_herrmannsdorfer

set -euo pipefail

if [ -f "$HOME/.zshenv" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.zshenv"
fi

DOTFILES="${DOTFILES:-$HOME/Projects/dotfiles}"
"$DOTFILES/leaderkey/scripts/chrome-toggle-vertical-tabs.sh"
