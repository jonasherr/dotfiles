#!/usr/bin/env bash
set -euo pipefail

LABEL="com.local.kanata"
PLIST="/Library/LaunchDaemons/$LABEL.plist"

if sudo launchctl print "system/$LABEL" >/dev/null 2>&1; then
  sudo launchctl bootout system "$PLIST"
fi

sudo rm -f "$PLIST"

echo "Kanata LaunchDaemon uninstalled."
