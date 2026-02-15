#!/bin/bash

# Script to stop Karabiner-Elements completely
# This is needed before running Kanata

echo "Stopping Karabiner-Elements..."
echo ""

# Method 1: Try to quit via AppleScript
echo "1. Attempting to quit Karabiner-Elements app..."
osascript -e 'quit app "Karabiner-Elements"' 2>/dev/null
sleep 2

# Method 2: Stop the services via launchctl
echo "2. Stopping Karabiner services..."

# User server
launchctl bootout gui/$(id -u)/org.pqrs.service.agent.karabiner_console_user_server 2>/dev/null
launchctl disable gui/$(id -u)/org.pqrs.service.agent.karabiner_console_user_server 2>/dev/null

# Session monitor (requires sudo)
echo "   (This may ask for your password to stop system service)"
sudo launchctl bootout system/org.pqrs.service.agent.karabiner_session_monitor 2>/dev/null
sudo launchctl disable system/org.pqrs.service.agent.karabiner_session_monitor 2>/dev/null

sleep 2

# Method 3: Force kill if still running
echo "3. Force killing any remaining processes..."
sudo killall -9 karabiner_console_user_server karabiner_session_monitor karabiner_grabber karabiner_observer 2>/dev/null

sleep 1

# Check status
echo ""
echo "Status check:"
if ps aux | grep -E "karabiner" | grep -v grep > /dev/null; then
    echo "⚠️  WARNING: Some Karabiner processes are still running:"
    ps aux | grep -E "karabiner" | grep -v grep
    echo ""
    echo "You may need to:"
    echo "1. Open Karabiner-Elements app"
    echo "2. Go to Misc tab"
    echo "3. Click 'Quit Karabiner-Elements'"
    echo ""
    echo "Or reboot your Mac."
else
    echo "✅ Success! Karabiner is fully stopped."
    echo ""
    echo "You can now start Kanata with:"
    echo "  kanata --cfg ~/.config/kanata/kanata.kbd"
fi
