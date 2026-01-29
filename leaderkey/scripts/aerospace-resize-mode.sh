#!/usr/bin/env bash
set -e
# Send keyboard shortcut to enter resize mode
osascript <<EOF
tell application "System Events"
    keystroke "s" using {option down, shift down}
end tell
EOF
