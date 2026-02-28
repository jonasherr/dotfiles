brew install sst/tap/opencode terminal-notifier || true

# https://github.com/sst/opencode

# Create real directories for local-only content (not symlinked from dotfiles)
mkdir -p "$HOME/.config/opencode/skills"

# Symlink public skills from dotfiles into the real skills directory
DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"
for skill in "$DOTFILES/opencode/skills"/*/; do
  skill_name=$(basename "$skill")
  target="$HOME/.config/opencode/skills/$skill_name"
  if [ ! -e "$target" ]; then
    ln -sf "$skill" "$target"
    echo "  Linked skill: $skill_name"
  fi
done

# Internal skills: install manually with
#   npx skills add vercel/internal-agent-skills --skill <name> -a opencode
# Choose "Copy" mode when prompted.
