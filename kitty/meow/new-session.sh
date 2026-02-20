#!/usr/bin/env bash
set -e

name=$(osascript -e 'Tell application "System Events" to display dialog "Session name:" default answer ""' -e 'text returned of result' 2>/dev/null || true)
name=$(printf "%s" "$name" | tr " " "-")

if [ -z "$name" ]; then
  exit 0
fi

session_file="$HOME/.config/kitty/sessions/${name}.kitty-session"
template="$HOME/.config/kitty/sessions/template.kitty-session"

if [ ! -f "$session_file" ]; then
  sed "s|{directory}|$HOME|g" "$template" > "$session_file"
fi

nvim "$session_file"

kitten @ --to "unix:$(ls /tmp/mykitty-* 2>/dev/null | head -n1)" action goto_session "$session_file"
