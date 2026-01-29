#!/usr/bin/env bash
set -e
osascript <<EOF
tell application "Google Chrome"
	tell window 1
		set activeIndex to active tab index
		if activeIndex > 1 then
			move tab activeIndex to before tab (activeIndex - 1)
		end if
	end tell
end tell
EOF
