#!/usr/bin/env bash
# Test Chrome automation permissions

echo "Testing Chrome automation permissions..."
echo ""

# Test 1: Can we talk to Chrome?
echo "Test 1: Basic Chrome communication"
osascript <<EOF 2>&1
tell application "Google Chrome"
    return "Chrome is accessible"
end tell
EOF

echo ""

# Test 2: Can we get tab info?
echo "Test 2: Reading tab information"
osascript <<EOF 2>&1
tell application "Google Chrome"
    if (count of windows) > 0 then
        tell window 1
            if (count of tabs) > 0 then
                return "Can read tabs: " & (URL of active tab)
            else
                return "No tabs open"
            end if
        end tell
    else
        return "No windows open"
    end if
end tell
EOF

echo ""

# Test 3: Can we send keyboard shortcuts?
echo "Test 3: System Events accessibility"
osascript <<EOF 2>&1
tell application "System Events"
    return "System Events is accessible"
end tell
EOF

echo ""
echo "If any test failed, you may need to grant permissions in:"
echo "System Settings > Privacy & Security > Automation"
echo "System Settings > Privacy & Security > Accessibility"
