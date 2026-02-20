#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Switch Kitty Session
# @raycast.mode compact
# @raycast.packageName Kitty
# @raycast.argument1 { "type": "text", "placeholder": "session name (e.g. dotfiles, notes)" }

# Optional parameters:
# @raycast.icon 🐈
# @raycast.description Switch to a kitty session by name. Available: dotfiles, notes, or any .kitty-session filename.

set -euo pipefail

session_name="$1"

# Find the kitty socket
sock="$(ls /tmp/mykitty-* 2>/dev/null | head -n1)"
if [ -z "$sock" ]; then
  echo "Kitty is not running"
  exit 1
fi

SESSIONS_DIR="$HOME/.config/kitty/sessions"
session_file="$SESSIONS_DIR/${session_name}.kitty-session"

if [ ! -f "$session_file" ]; then
  # Try fuzzy match — find session files containing the argument
  match=$(find "$SESSIONS_DIR" -name "*${session_name}*.kitty-session" ! -name "template.kitty-session" 2>/dev/null | head -n1)
  if [ -n "$match" ]; then
    session_file="$match"
  else
    echo "No session matching: $session_name"
    exit 1
  fi
fi

# Switch to the session via kitty remote control
/Applications/kitty.app/Contents/MacOS/kitten @ --to "unix:${sock}" action goto_session "$session_file"

# Bring kitty to the foreground
osascript -e 'tell application "kitty" to activate'

session_basename=$(basename "$session_file" .kitty-session)
echo "Switched to: $session_basename"
