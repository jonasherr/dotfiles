#!/usr/bin/env bash
set -euo pipefail

# Toggle Chrome's native vertical tab strip by pressing the actual
# Accessibility button. No coordinate-based clicking, no mouse movement.

if [ -f "$HOME/.zshenv" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.zshenv"
fi

DOTFILES="${DOTFILES:-$HOME/Projects/dotfiles}"
SCRIPT_DIR="$DOTFILES/leaderkey/scripts"
BINARY="$SCRIPT_DIR/chrome-toggle-vertical-tabs"
SOURCE="$SCRIPT_DIR/chrome-toggle-vertical-tabs.swift"

open -a "Google Chrome"
osascript -e 'tell application "Google Chrome" to activate'
sleep 0.08

# Fast path from tabbar-shortcut-chrome. It targets the exact Chrome UI node for
# the button shown in the screenshot: the vertical tab strip collapse/expand
# button. This is intentionally not coordinate based.
if osascript <<'APPLESCRIPT' >/dev/null 2>&1
tell application "System Events"
  tell process "Google Chrome"
    repeat with w in (every window)
      set wName to name of w
      if wName is not "Picture in Picture" and wName does not contain "Video playing in picture-in-picture mode" then
        try
          click button 1 of group 1 of UI element 3 of group 1 of group 1 of group 1 of group 1 of w
          return
        end try
      end if
    end repeat
  end tell
end tell
error "Chrome vertical tabs button not found"
APPLESCRIPT
then
  echo "Toggled Chrome vertical tabs"
  exit 0
fi

# Fallback from ChromeSidebarToggleRaycast's approach: walk the Accessibility
# tree and press a button named/descrbed Expand tabs or Collapse tabs.
if [ ! -x "$BINARY" ] || [ "$SOURCE" -nt "$BINARY" ]; then
  swiftc -O "$SOURCE" -o "$BINARY"
fi

"$BINARY"
echo "Toggled Chrome vertical tabs"
