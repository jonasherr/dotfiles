#!/usr/bin/env bash
set -euo pipefail

DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PROFILE="${1:-}"

case "$PROFILE" in
  work|personal) ;;
  *)
    echo "Usage: $0 <work|personal>" >&2
    exit 1
    ;;
esac

source_file="$DOTFILES/pi/settings.$PROFILE.json"
target_file="$PI_AGENT_DIR/settings.json"

if [ ! -f "$source_file" ]; then
  echo "Missing profile: $source_file" >&2
  exit 1
fi

mkdir -p "$PI_AGENT_DIR"

if [ -e "$target_file" ] || [ -L "$target_file" ]; then
  rm "$target_file"
fi

relative_source=$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$source_file" "$PI_AGENT_DIR")
ln -s "$relative_source" "$target_file"

echo "Selected Pi profile: $PROFILE"
echo "  $target_file -> $relative_source"
