#!/usr/bin/env bash
# normal.sh - Switch to normal mode
# Configures: aerospace gaps, screen resolution, Chrome zoom, bookmarks, DND

set -e

echo "🔄 Switching to normal mode..."

# 1. Aerospace gaps - restore multi-monitor config
echo "  → Restoring aerospace gaps..."
sed -i '' '66s/outer\.top = 1  # \[/outer.top = [/' "$DOTFILES/aerospace/config.toml"
sed -i '' '67i\
    { monitor."built-in" = 12 },\
    { monitor."main" = 36 },\
    36\
    ]' "$DOTFILES/aerospace/config.toml"
aerospace reload-config
sleep 1

# 2. Screen resolution - 2560x1440
echo "  → Setting resolution to 2560x1440..."
displayplacer "id:DEF9E160-9734-4F15-B3A2-291547482CCA res:2560x1440 hz:60 color_depth:8 enabled:true scaling:on origin:(0,0) degree:0"
sleep 1

# 3. Chrome zoom - 100% (reset)
echo "  → Resetting Chrome zoom to 100%..."
osascript -e 'tell application "Google Chrome" to activate'
sleep 0.5
osascript -e 'tell application "System Events" to keystroke "0" using command down'
sleep 0.5

# 4. Chrome bookmarks - show (only toggle if not already shown)
echo "  → Showing Chrome bookmarks bar..."
STATE_FILE="$HOME/.config/leaderkey/mode_state"
mkdir -p "$(dirname "$STATE_FILE")"
CURRENT_MODE=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")
if [ "$CURRENT_MODE" != "normal" ]; then
  osascript -e 'tell application "System Events" to keystroke "b" using {command down, shift down}'
  sleep 0.5
fi
echo "normal" > "$STATE_FILE"

# 5. Do Not Disturb - disable
echo "  → Disabling Do Not Disturb..."
open "raycast://extensions/yakitrak/do-not-disturb/off"
sleep 1

echo "✅ Normal mode active"
