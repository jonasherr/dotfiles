#!/usr/bin/env bash
set -e
osascript <<'EOF'
tell application "System Events" to tell process "NotificationCenter"
  if not (window "Notification Center" exists) then return

  set notificationContainer to a reference to group 1 of scroll area 1 of group 1 of group 1 of window "Notification Center"

  -- Click the default action on the most recent notification
  repeat with a in (actions of notificationContainer whose description is not "Close" and description is not "Clear All" and description is not "Clear")
    perform a
    exit repeat
  end repeat
end tell
EOF
