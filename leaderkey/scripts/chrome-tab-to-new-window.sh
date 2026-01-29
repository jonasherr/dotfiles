#!/usr/bin/env bash
set -e
osascript <<EOF
tell application "Google Chrome"
	tell its window 1
		set theURL to URL of active tab
		close active tab
	end tell
	set the URL of active tab of (make new window) to theURL
end tell
EOF
