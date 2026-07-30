#!/usr/bin/env bash
set -euo pipefail

DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"
DOTFILES_TILDE="${DOTFILES/#$HOME/~}"
SKILLS_DIR="$DOTFILES/pi/skills"
AGENTS_SKILLS_DIR="$HOME/.agents/skills"

mkdir -p "$AGENTS_SKILLS_DIR"

for skill in "$SKILLS_DIR"/*/; do
  [ -f "${skill}SKILL.md" ] || continue

  skill_name=$(basename "$skill")
  agents_target="$AGENTS_SKILLS_DIR/$skill_name"

  if [ -L "$agents_target" ]; then
    link_target=$(readlink "$agents_target")
    case "$link_target" in
      "$DOTFILES/opencode/skills/$skill_name"|"$DOTFILES/opencode/skills/$skill_name/"|"$DOTFILES_TILDE/opencode/skills/$skill_name"|"$DOTFILES_TILDE/opencode/skills/$skill_name/"|"$SKILLS_DIR/$skill_name"|"$SKILLS_DIR/$skill_name/"|"$DOTFILES_TILDE/pi/skills/$skill_name"|"$DOTFILES_TILDE/pi/skills/$skill_name/"|"../../Projects/dotfiles/pi/skills/$skill_name")
        rm "$agents_target"
        ;;
      *)
        echo "  Skipped shared skill with custom symlink: $skill_name -> $link_target"
        continue
        ;;
    esac
  elif [ -e "$agents_target" ]; then
    echo "  Skipped shared skill with existing directory: $skill_name"
    continue
  fi

  relative_target=$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$SKILLS_DIR/$skill_name" "$AGENTS_SKILLS_DIR")
  ln -s "$relative_target" "$agents_target"
  echo "  Linked shared skill: $skill_name"
done

# Remove stale compatibility skill links that point into old repo locations.
for compatibility_dir in "$HOME/.config/opencode/skills"; do
  [ -d "$compatibility_dir" ] || continue

  for skill in "$compatibility_dir"/*; do
    [ -L "$skill" ] || continue
    link_target=$(readlink "$skill")
    case "$link_target" in
      "$DOTFILES/opencode/skills/"*|"$DOTFILES_TILDE/opencode/skills/"*|"$DOTFILES/pi/skills/"*|"$DOTFILES_TILDE/pi/skills/"*)
        rm "$skill"
        echo "  Removed stale skill link: $(basename "$skill")"
        ;;
    esac
  done
done
