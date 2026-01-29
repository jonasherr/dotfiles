#!/usr/bin/env bash
# presenting.sh - Switch to presentation mode
# Configures: aerospace gaps, screen resolution, Chrome zoom, bookmarks, DND

set -e

echo "🎬 Switching to presenting mode..."

# 1. Aerospace gaps - set outer.top to 1 for presenting
echo "  → Setting aerospace gaps..."
sed -i '' '66,70s/outer\.top = \[/outer.top = 1  # [/' "$DOTFILES/aerospace/config.toml"
sed -i '' '67,70d' "$DOTFILES/aerospace/config.toml"
aerospace reload-config
sleep 1

# 2. Screen resolution - 1920x1080
echo "  → Setting resolution to 1920x1080..."
displayplacer "id:DEF9E160-9734-4F15-B3A2-291547482CCA res:1920x1080 hz:60 color_depth:8 enabled:true scaling:on origin:(0,0) degree:0"
sleep 1

# 3. Chrome zoom - 150% (reset to 100%, then zoom 5x)
echo "  → Setting Chrome zoom to 150%..."
osascript -e 'tell application "Google Chrome" to activate'
sleep 0.5
osascript -e 'tell application "System Events" to keystroke "0" using command down'
sleep 0.3
for i in {1..5}; do
  osascript -e 'tell application "System Events" to keystroke "=" using command down'
  sleep 0.1
done
sleep 0.5

# 4. Chrome bookmarks - hide (only toggle if not already hidden)
echo "  → Hiding Chrome bookmarks bar..."
STATE_FILE="$HOME/.config/leaderkey/mode_state"
mkdir -p "$(dirname "$STATE_FILE")"
CURRENT_MODE=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")
if [ "$CURRENT_MODE" != "presenting" ]; then
  osascript -e 'tell application "System Events" to keystroke "b" using {command down, shift down}'
  sleep 0.5
fi
echo "presenting" > "$STATE_FILE"

# 5. Do Not Disturb - enable
echo "  → Enabling Do Not Disturb..."
open "raycast://extensions/yakitrak/do-not-disturb/on"
sleep 1

echo "✅ Presenting mode active"
