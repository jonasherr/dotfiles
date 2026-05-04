brew install sst/tap/opencode terminal-notifier || true

# https://github.com/sst/opencode

# ~/.agents/skills is for private/shared global skills.
# Public skills are committed in dotfiles and exposed directly to OpenCode.
mkdir -p "$HOME/.agents/skills" "$HOME/.config/opencode/skills"

DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"

# Public skills: dotfiles/opencode/skills/<name> -> ~/.config/opencode/skills/<name>.
# Pi scans dotfiles/opencode/skills directly, so these no longer need ~/.agents/skills links.
for skill in "$DOTFILES/opencode/skills"/*/; do
  [ -d "$skill" ] || continue

  skill_name=$(basename "$skill")
  agents_target="$HOME/.agents/skills/$skill_name"
  opencode_target="$HOME/.config/opencode/skills/$skill_name"

  if [ -L "$agents_target" ]; then
    agents_link_target=$(readlink "$agents_target")
    case "$agents_link_target" in
      "$DOTFILES/opencode/skills/$skill_name"|"$DOTFILES/opencode/skills/$skill_name/")
        rm "$agents_target"
        echo "  Removed obsolete shared public skill link: $skill_name"
        ;;
    esac
  fi

  if [ -L "$opencode_target" ] && [ "$(readlink "$opencode_target")" = "$agents_target" ]; then
    rm "$opencode_target"
  fi

  if [ ! -e "$opencode_target" ] && [ ! -L "$opencode_target" ]; then
    ln -s "$skill" "$opencode_target"
    echo "  Linked OpenCode public skill: $skill_name"
  fi
done

# Private/shared global skills: ~/.agents/skills/<name> -> ~/.config/opencode/skills/<name>.
for skill in "$HOME/.agents/skills"/*/; do
  [ -d "$skill" ] || continue

  skill_name=$(basename "$skill")
  opencode_target="$HOME/.config/opencode/skills/$skill_name"

  if [ ! -e "$opencode_target" ] && [ ! -L "$opencode_target" ]; then
    ln -s "$skill" "$opencode_target"
    echo "  Linked OpenCode shared skill: $skill_name"
  fi
done
