#!/usr/bin/env bash
set -e
osascript <<'EOF'
tell application "System Events" to tell process "NotificationCenter"
  if not (window "Notification Center" exists) then return

  set notificationContainer to a reference to group 1 of scroll area 1 of group 1 of group 1 of window "Notification Center"

  -- Close all notification groups in reverse order to avoid index shifts
  set notificationGroups to a reference to groups of notificationContainer
  repeat with i from (number of notificationGroups) to 1 by -1
    set g to item i of notificationGroups
    repeat with a in (actions of g whose description is "Close" or description starts with "Clear")
      ignoring application responses
        perform a
      end ignoring
    end repeat
  end repeat

  -- Close the container itself (handles single remaining notification)
  repeat with a in (actions of notificationContainer whose description is "Close" or description starts with "Clear")
    perform a
  end repeat
end tell
EOF
