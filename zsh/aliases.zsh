# For a full list of active aliases, run `alias`.

# ALIASES ---------------------------------------------------------------------
alias vim="nvim"
alias v="nvim ."
alias n="nvim"
# Claude Code with Vercel AI Gateway
unalias cc 2>/dev/null
cc() {
  ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh" \
  ANTHROPIC_API_KEY="" \
  ANTHROPIC_AUTH_TOKEN="$(security find-generic-password -s 'ANTHROPIC_AUTH_TOKEN' -w)" \
  claude "$@"
}
# Claude Code with Docker Sandbox and Vercel AI Gateway
ccd() {
  docker sandbox run \
    -e ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh" \
    -e ANTHROPIC_API_KEY="" \
    -e ANTHROPIC_AUTH_TOKEN="$(security find-generic-password -s 'ANTHROPIC_AUTH_TOKEN' -w)" \
    --credentials=none \
    claude "$@"
}
alias oc="opencode"
# OpenCode Container Sandbox
alias occ="$DOTFILES/sandbox/opencode-sandbox"
_occ_find() {
  # Find sandbox(es) matching current directory or all if no match
  local project_dir meta_dir="/tmp/opencode-sandbox"
  project_dir="$(pwd -P)"
  local matches=()
  if [ -d "$meta_dir" ]; then
    for f in "$meta_dir"/*.json; do
      [ -f "$f" ] || continue
      local p
      p=$(jq -r '.project' "$f" 2>/dev/null)
      if [ "$p" = "$project_dir" ]; then
        matches+=("$f")
      fi
    done
  fi
  # If no match for current dir, show all
  if [ ${#matches[@]} -eq 0 ] && [ -d "$meta_dir" ]; then
    for f in "$meta_dir"/*.json; do
      [ -f "$f" ] || continue
      matches+=("$f")
    done
  fi
  if [ ${#matches[@]} -eq 0 ]; then
    echo "No running sandbox found." >&2
    return 1
  fi
  if [ ${#matches[@]} -eq 1 ]; then
    cat "${matches[0]}"
    return 0
  fi
  # Multiple matches — let user pick
  echo "Multiple sandboxes running:" >&2
  local i=1
  for f in "${matches[@]}"; do
    local name port proj
    name=$(jq -r '.container' "$f" 2>/dev/null)
    port=$(jq -r '.port' "$f" 2>/dev/null)
    proj=$(jq -r '.project' "$f" 2>/dev/null)
    echo "  $i) $name (port $port) → $proj" >&2
    i=$((i + 1))
  done
  local choice
  read -r -p "  Select [1-${#matches[@]}]: " choice
  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#matches[@]} ]; then
    cat "${matches[$((choice))]}"
    return 0
  fi
  echo "Invalid selection." >&2
  return 1
}
occ-attach() {
  local meta
  meta=$(_occ_find) || return 1
  local port
  port=$(echo "$meta" | jq -r '.port')
  opencode attach "http://127.0.0.1:${port}"
}
occ-stop() {
  local meta
  meta=$(_occ_find) || return 1
  local name port sock
  name=$(echo "$meta" | jq -r '.container')
  port=$(echo "$meta" | jq -r '.port')
  sock=$(echo "$meta" | jq -r '.sock')
  echo "Stopping $name (port $port)..."
  # Kill relay using the port
  lsof -Pi :"$port" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
  rm -f "$sock"
  container stop "$name" 2>/dev/null || true
  container rm "$name" 2>/dev/null || true
  rm -f "/tmp/opencode-sandbox/${name}.json"
  echo "Stopped and removed."
}
occ-logs() {
  local meta
  meta=$(_occ_find) || return 1
  local name
  name=$(echo "$meta" | jq -r '.container')
  container logs "$name"
}
occ-rebuild() {
  container image rm opencode-sandbox:latest 2>/dev/null
  echo "Image removed. Next 'occ' run will rebuild."
}
och() {
  cd /Users/jonasherrmansdsoerfer/Projects/vercel/agent-help && opencode "$@"
}
alias zshconfig="nvim ~/Projects/dotfiles/zsh/zsh.rc"
alias zshalias="nvim ~/Projects/dotfiles/zsh/aliases.zsh"
alias arm="env /usr/bin/arch -arm64 /bin/zsh"
alias intel="env /usr/bin/arch -x86_64 /bin/zsh"
alias ip="ipconfig getifaddr en0"
alias tt="ttyper"
alias ttjs="ttyper -l javascript"
alias python="python3"
alias mouse="bash $DOTFILES/scripts/mouse.sh"
alias summary="pbpaste | llm --system 'summary bullet points' -s"
alias article="pbpaste | llm --system 'You are an expert technical writer. I will give you a title and some bulletpoints. You will will write a friendly and engaging article in simple language.' -s"
alias windows="bash ~/Projects/dotfiles/scripts/tmux-windows.sh"
alias ld="lazydocker"
alias lg="lazygit"
alias ff="fzf --style full \
    --preview 'fzf-preview.sh {}' --bind 'focus:transform-header:file --brief {}'"
# alias cd="z"
alias ls="eza --icons=always"
alias lt="eza --icons=always -T -L 2 --ignore-glob=node_modules"
alias lsa="eza --icons=always -a"
alias lta="eza --icons=always -T -L 2 --ignore-glob=node_modules -a"

# corepack
alias yarn="corepack yarn"
alias yarnpkg="corepack yarnpkg"
alias pnpm="corepack pnpm"
alias pnpx="corepack pnpx"
alias npm="corepack npm"
alias npx="corepack npx"

# LOCATION ALIASES -----------------------------------------------------------------
alias desktop="cd ~/Desktop"
alias downloads="cd ~/Downloads"
alias documents="cd ~/Documents"
alias icloud="cd '~/Library/Mobile Documents/com~apple~CloudDocs'"
alias notes="cd '~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes'"
alias dotfiles="cd ~/Projects/dotfiles"
alias pp="cd ~/Projects"
alias link-dotfiles="bash ~/Projects/dotfiles/install/bootstrap.sh"
alias ssh="export TERM=xterm-256color; ssh"
