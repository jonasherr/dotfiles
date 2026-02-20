#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Switch Kitty Session
# @raycast.mode silent
# @raycast.packageName Kitty

# Optional parameters:
# @raycast.icon 🐈
# @raycast.description Switch between kitty terminal sessions using fzf

set -euo pipefail

# Find the kitty socket
sock="$(ls /tmp/mykitty-* 2>/dev/null | head -n1)"
if [ -z "$sock" ]; then
  echo "Kitty is not running (no socket found at /tmp/mykitty-*)"
  exit 1
fi

SESSIONS_DIR="$HOME/.config/kitty/sessions"

# List session files, excluding template
sessions=$(find "$SESSIONS_DIR" -name "*.kitty-session" ! -name "template.kitty-session" 2>/dev/null | sort)

if [ -z "$sessions" ]; then
  echo "No session files found in $SESSIONS_DIR"
  exit 1
fi

# Use fzf to pick a session (show just the filename stem for readability)
selected=$(echo "$sessions" | xargs -I{} basename {} .kitty-session | fzf --prompt="🐈 session > " --reverse --height=40%)

if [ -z "$selected" ]; then
  exit 0
fi

session_file="$SESSIONS_DIR/${selected}.kitty-session"

# Switch to the selected session via kitty remote control
/Applications/kitty.app/Contents/MacOS/kitten @ --to "unix:${sock}" action goto_session "$session_file"

# Bring kitty to the foreground
osascript -e 'tell application "kitty" to activate'
