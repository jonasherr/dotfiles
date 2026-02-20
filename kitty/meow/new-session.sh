#!/usr/bin/env bash
set -e

printf "Session name: "
read -r name

if [ -z "$name" ]; then
  exit 0
fi

session_file="$HOME/.config/kitty/sessions/${name}.kitty-session"
template="$HOME/.config/kitty/sessions/template.kitty-session"

if [ -f "$session_file" ]; then
  echo "Session '$name' already exists, switching to it..."
  sleep 1
else
  sed "s|{directory}|$HOME|g" "$template" > "$session_file"
fi

kitten @ --to "unix:$(ls /tmp/mykitty-* 2>/dev/null | head -n1)" action goto_session "$session_file"
