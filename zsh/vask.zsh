# Ask fx a researched Vercel, Next.js, or Eve question.
# System instructions live alongside this function in the dotfiles repository.
function vask() {
  local -A options
  zparseopts -D -E -A options s: -system: h -help

  if (( ${+options[-h]} || ${+options[--help]} )); then
    cat <<'EOF'
Usage: vask [--system <text>] <question>

Researches Vercel and Next.js documentation, then answers concisely with sources.
Use --system to append additional system instructions.
EOF
    return 0
  fi

  if (( $# == 0 )); then
    print -u2 -- 'vask: provide a question'
    print -u2 -- 'Usage: vask [--system <text>] <question>'
    return 2
  fi

  local system_file="$DOTFILES/zsh/vask-system.md"
  if [[ ! -r $system_file ]]; then
    print -u2 -- "vask: cannot read system prompt: $system_file"
    return 1
  fi

  local system_context
  system_context=$(<"$system_file")

  local additional_system="${options[-s]:-${options[--system]:-}}"
  if [[ -n $additional_system ]]; then
    system_context+=$'\n\nAdditional system instructions:\n'
    system_context+=$additional_system
  fi

  local user_question="$*"
  local prompt=$'System instructions:\n'"$system_context"$'\n\nUser question:\n'"$user_question"

  command fx ask "$prompt"
}
