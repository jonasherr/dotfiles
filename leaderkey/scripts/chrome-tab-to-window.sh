#!/usr/bin/env bash
set -e
# Get list of Chrome windows and prompt user
osascript <<EOF
tell application "Google Chrome"
	set windowCount to count of windows
	if windowCount < 2 then
		display dialog "Only one Chrome window open" buttons {"OK"} default button 1
		return
	end if
	
	set windowList to {}
	repeat with i from 1 to windowCount
		tell window i
			set tabInfo to ""
			if (count of tabs) > 0 then
				set tabInfo to title of active tab & " (" & (count of tabs) & " tabs)"
			end if
			set end of windowList to "Window " & i & ": " & tabInfo
		end tell
	end repeat
	
	set chosenWindow to choose from list windowList with prompt "Move tab to which window?"
	if chosenWindow is false then return
	
	set targetWindow to (word 2 of (item 1 of chosenWindow)) as integer
	
	tell window 1
		set theURL to URL of active tab
		close active tab
	end tell
	
	set the URL of active tab of window targetWindow to theURL
end tell
EOF
