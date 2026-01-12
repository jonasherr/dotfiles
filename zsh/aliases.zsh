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
