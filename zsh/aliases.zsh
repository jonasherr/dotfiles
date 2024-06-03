# For a full list of active aliases, run `alias`.
#
# ALIASES ---------------------------------------------------------------------
alias vim="nvim"
alias zshconfig="nvim ~/.zshrc"
alias arm="env /usr/bin/arch -arm64 /bin/zsh"
alias intel="env /usr/bin/arch -x86_64 /bin/zsh"
alias ip="ipconfig getifaddr en0"
alias tt="ttyper"
alias ttjs="ttyper -l javascript"
alias python="python3"
alias mouse="bash ~/mouse.sh"
alias summary="pbpaste | llm --system 'summary bullet points' -s"
alias article="pbpaste | llm --system 'You are an expert technical writer. I will give you a title and some bulletpoints. You will will write a friendly and engaging article in simple language.' -s"
alias windows="bash /Users/jonas/.dotfiles/tmux-windows.sh"
alias ld="lazydocker"

# LOCATION ALIASES -----------------------------------------------------------------
alias desktop="cd /Users/jonas/Desktop"
alias downloads="cd /Users/jonas/Downloads"
alias documents="cd /Users/jonas/Documents"
alias icloud="cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/"
alias notes="cd /Users/jonas/Library/Mobile Documents/iCloud~md~obsidian/Documents/Bear"
alias dotfiles="cd /Users/jonas/Projects/dotfiles"
alias pp="cd /Users/jonas/Projects"
alias e1="cd /Users/jonas/WebstormProjects/e1-series-apps"
alias e1f="cd /Users/jonas/WebstormProjects/e1-series-apps/apps/frontend"
alias e1b="cd /Users/jonas/WebstormProjects/e1-series-apps/apps/backend"
