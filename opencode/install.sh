brew install sst/tap/opencode terminal-notifier || true

# https://github.com/sst/opencode

# ~/.agents/skills is the cross-agent source of truth.
# OpenCode gets compatibility symlinks from ~/.config/opencode/skills/<name> to ~/.agents/skills/<name>.
mkdir -p "$HOME/.agents/skills" "$HOME/.config/opencode/skills"

DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"

# Public skills are committed in dotfiles and exposed via ~/.agents/skills.
for skill in "$DOTFILES/opencode/skills"/*/; do
  skill_name=$(basename "$skill")
  agents_target="$HOME/.agents/skills/$skill_name"
  opencode_target="$HOME/.config/opencode/skills/$skill_name"

  if [ ! -e "$agents_target" ] && [ ! -L "$agents_target" ]; then
    ln -s "$skill" "$agents_target"
    echo "  Linked shared public skill: $skill_name"
  fi

  if [ ! -e "$opencode_target" ] && [ ! -L "$opencode_target" ]; then
    ln -s "$agents_target" "$opencode_target"
    echo "  Linked OpenCode skill: $skill_name"
  fi
done

# Other/private skills should be installed under ~/.agents/skills/<name> and then
# symlinked into ~/.config/opencode/skills/<name> if OpenCode needs them.
