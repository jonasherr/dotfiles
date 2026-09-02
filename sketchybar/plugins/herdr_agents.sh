#!/usr/bin/env bash

set -euo pipefail

CONFIG_DIR="$HOME/.config/sketchybar"
source "$CONFIG_DIR/colors.sh"

prefix="herdr_agent_"
startup_session="$HOME/.config/kitty/sessions/startup.kitty-session"

snapshot="$(herdr api snapshot 2>/dev/null || true)"
if [[ -z "$snapshot" ]]; then
  exit 0
fi

declared_items=()

while IFS=$'\t' read -r pane_id state workspace tab title; do
  [[ -z "$pane_id" ]] && continue

  case "$state" in
    blocked)
      symbol="×"
      color="$RED"
      ;;
    working)
      symbol="◐"
      color="$YELLOW"
      ;;
    done)
      symbol="✓"
      color="$GREEN"
      ;;
    idle|unknown)
      # Keep the bar focused on active work and attention-needed agents.
      continue
      ;;
  esac

  item="${prefix}${pane_id//[^[:alnum:]]/_}"
  declared_items+=("$item")
  click_script="open -a kitty --args --single-instance --session '$startup_session'; sleep 0.2; herdr agent focus '$pane_id'"

  if ! sketchybar --query "$item" >/dev/null 2>&1; then
    sketchybar --add item "$item" right
    sketchybar --move "$item" after battery
    sketchybar --set "$item" \
      icon="$symbol" \
      icon.color="$color" \
      icon.font="SF Pro:Semibold:14.0" \
      icon.padding_left=3 \
      icon.padding_right=3 \
      label="$workspace · $tab · $title" \
      label.drawing=off \
      drawing=on \
      click_script="$click_script"
    continue
  fi

  sketchybar --move "$item" after battery

  current="$(sketchybar --query "$item" 2>/dev/null)"
  current_icon="$(jq -r '.icon.value // ""' <<< "$current")"
  current_color="$(jq -r '.icon.color // ""' <<< "$current")"
  current_drawing="$(jq -r '.icon.drawing // "off"' <<< "$current")"

  if [[ "$current_icon" != "$symbol" || "$current_color" != "$color" || "$current_drawing" != "on" ]]; then
    sketchybar --set "$item" \
      icon="$symbol" \
      icon.color="$color" \
      drawing=on
  fi
done < <(
  jq -r '
    .result.snapshot.agents[]
    | [
        (.pane_id // ""),
        (.agent_status // "unknown"),
        (.workspace_label // .workspace_id // ""),
        (.tab_label // .tab_id // ""),
        (.terminal_title_stripped // .agent // "")
      ]
    | @tsv
  ' <<< "$snapshot"
)

# Remove only items whose agents are no longer active. Existing active items
# are left untouched when their icon and color have not changed.
while IFS= read -r item; do
  [[ -z "$item" ]] && continue
  keep=false
  for declared in "${declared_items[@]}"; do
    if [[ "$item" == "$declared" ]]; then
      keep=true
      break
    fi
  done
  [[ "$keep" == false ]] && sketchybar --remove "$item"
done < <(sketchybar --query bar 2>/dev/null | jq -r --arg prefix "$prefix" '.items[] | select(startswith($prefix))')
