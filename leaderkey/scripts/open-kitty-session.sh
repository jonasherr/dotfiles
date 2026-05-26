#!/usr/bin/env bash

set -euo pipefail

session_name="${1:?session name required}"
session_path="$HOME/.config/kitty/sessions/${session_name}.kitty-session"
kitten="/Applications/kitty.app/Contents/MacOS/kitten"

session_cwd="$(awk '
  $1 == "cd" {
    sub(/^cd[[:space:]]+/, "")
    print
    exit
  }
' "$session_path" 2>/dev/null || true)"
session_cwd="${session_cwd/#\~/$HOME}"

if [[ ! -f "$session_path" ]]; then
  osascript -e "display notification \"Session not found: ${session_name}\" with title \"LeaderKey\""
  exit 1
fi

find_kitty_socket() {
  local socket

  while IFS= read -r socket; do
    if "$kitten" @ --to "unix:$socket" ls 2>/dev/null | python3 -c 'import json, sys; sys.exit(0 if len(json.load(sys.stdin)) > 0 else 1)' 2>/dev/null; then
      printf '%s\n' "$socket"
      return 0
    fi
  done < <(find /private/tmp /tmp -maxdepth 1 -name 'mykitty-*' -print 2>/dev/null)

  return 1
}

socket="$(find_kitty_socket || true)"

if [[ -z "$socket" ]]; then
  open -a kitty --args --session "$session_path"
else
  if ! error_output="$("$kitten" @ --to "unix:$socket" action goto_session "$session_path" 2>&1)"; then
    osascript - "$error_output" <<'OSA'
on run argv
  display notification (item 1 of argv) with title "Failed to open Kitty session"
end run
OSA
    exit 1
  fi

  if [[ -n "$session_cwd" ]]; then
    # `goto_session` may create the tab but not focus it when called from outside kitty.
    # Give kitty a moment, then focus the window whose cwd belongs to the target session.
    sleep 0.1
    existing_window_id="$("$kitten" @ --to "unix:$socket" ls 2>/dev/null | python3 -c '
import json
import sys

target = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

for os_window in data:
    for tab in os_window.get("tabs", []):
        for window in tab.get("windows", []):
            cwd = window.get("cwd") or ""
            if cwd == target or cwd.startswith(target + "/"):
                print(window.get("id"))
                sys.exit(0)
' "$session_cwd" || true)"

    if [[ -n "$existing_window_id" ]]; then
      "$kitten" @ --to "unix:$socket" focus-window --match "id:$existing_window_id" >/dev/null 2>&1 || true
    fi
  fi

  osascript -e 'tell application "kitty" to activate'
fi
