#!/usr/bin/env bash
set -euo pipefail

LABEL="com.local.kanata"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEMPLATE="$TEMPLATE_DIR/launchd/$LABEL.plist.template"
KANATA_BIN="$(command -v kanata)"
KANATA_CFG="$HOME/.config/kanata/kanata.kbd"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 1
fi

if [ ! -x "$KANATA_BIN" ]; then
  echo "Kanata binary not found. Install it with: brew install kanata" >&2
  exit 1
fi

if [ ! -f "$KANATA_CFG" ]; then
  echo "Kanata config not found: $KANATA_CFG" >&2
  echo "Run ./install/bootstrap.sh from the dotfiles root first." >&2
  exit 1
fi

TMP_PLIST="$(mktemp)"
sed \
  -e "s#__KANATA_BIN__#$KANATA_BIN#g" \
  -e "s#__KANATA_CFG__#$KANATA_CFG#g" \
  "$TEMPLATE" > "$TMP_PLIST"

sudo install -o root -g wheel -m 644 "$TMP_PLIST" "$PLIST"
rm -f "$TMP_PLIST"

if sudo launchctl print "system/$LABEL" >/dev/null 2>&1; then
  sudo launchctl bootout system "$PLIST" >/dev/null 2>&1 || true
fi

sudo launchctl bootstrap system "$PLIST"
sudo launchctl enable "system/$LABEL"
sudo launchctl kickstart -k "system/$LABEL"

echo "Kanata LaunchDaemon installed and started."
echo "Status: sudo launchctl print system/$LABEL"
echo "Logs:   tail -f /var/log/kanata.log /var/log/kanata.err.log"
