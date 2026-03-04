brew install --cask raycast

# https://www.raycast.com/

# Symlink Vercel-internal Raycast extensions (work laptop only)
VERCEL_RAYCAST_DIR="$HOME/Projects/vercel/tools/vercel-raycast"
if [ -d "$VERCEL_RAYCAST_DIR" ]; then
  DOTFILES="${DOTFILES:-$(cd "$(dirname "$0")/.." && pwd)}"
  EXTENSIONS=("vercel-dse-tickets")
  for ext in "${EXTENSIONS[@]}"; do
    target="$DOTFILES/raycast/custom-extensions/$ext"
    if [ ! -e "$target" ]; then
      ln -sf "$VERCEL_RAYCAST_DIR/extensions/$ext" "$target"
      echo "  Linked Vercel extension: $ext"
    fi
  done
fi
