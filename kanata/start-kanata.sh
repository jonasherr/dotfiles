#!/usr/bin/env bash
set -euo pipefail

KANATA_BIN="$(command -v kanata || true)"
if [ -z "$KANATA_BIN" ] || [ ! -x "$KANATA_BIN" ]; then
  echo "Kanata binary not found. Install it with: brew install --HEAD kanata" >&2
  exit 1
fi

exec sudo "$KANATA_BIN" --no-wait --cfg "$HOME/.config/kanata/kanata.kbd"
