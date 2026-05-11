#!/usr/bin/env bash
#
# bootstrap installs things.

cd "$(dirname "$0")/.."
DOTFILES=$(pwd -P)

set -e

echo ''

info () {
  printf "\r  [ \033[00;34m..\033[0m ] $1\n"
}

user () {
  printf "\r  [ \033[0;33m??\033[0m ] $1\n"
}

success () {
  printf "\r\033[2K  [ \033[00;32mOK\033[0m ] $1\n"
}

fail () {
  printf "\r\033[2K  [\033[0;31mFAIL\033[0m] $1\n"
  echo ''
  exit
}

link_file () {
  local src=$1 dst=$2

  local overwrite=
  local backup=
  local skip=
  local action=

  if [ -f "$dst" ] || [ -d "$dst" ] || [ -L "$dst" ]
  then

    if [ "$overwrite_all" == "false" ] && [ "$backup_all" == "false" ] && [ "$skip_all" == "false" ]
    then

      # ignoring exit 1 from readlink in case where file already exists
      # shellcheck disable=SC2155
      local currentSrc="$(readlink $dst)"

      if [ "$currentSrc" == "$src" ]
      then

        skip=true;

      else

        user "File already exists: $dst ($(basename "$src")), what do you want to do?\n\
        [s]kip, [S]kip all, [o]verwrite, [O]verwrite all, [b]ackup, [B]ackup all?"
        read -n 1 action  < /dev/tty

        case "$action" in
          o )
            overwrite=true;;
          O )
            overwrite_all=true;;
          b )
            backup=true;;
          B )
            backup_all=true;;
          s )
            skip=true;;
          S )
            skip_all=true;;
          * )
            ;;
        esac

      fi

    fi

    overwrite=${overwrite:-$overwrite_all}
    backup=${backup:-$backup_all}
    skip=${skip:-$skip_all}

    if [ "$overwrite" == "true" ]
    then
      rm -rf "$dst"
      success "removed $dst"
    fi

    if [ "$backup" == "true" ]
    then
      mv "$dst" "${dst}.backup"
      success "moved $dst to ${dst}.backup"
    fi

    if [ "$skip" == "true" ]
    then
      success "skipped $src"
    fi
  fi

  if [ "$skip" != "true" ]  # "false" or empty
  then
    local link_src="$1"
    if [[ "$link_src" == "$HOME/"* ]] && [[ "$2" == "$HOME/"* ]]; then
      link_src=$(python3 - "$link_src" "$(dirname "$2")" <<'PY'
import os
import sys

src = os.path.abspath(os.path.expanduser(sys.argv[1]))
dst_dir = os.path.abspath(os.path.expanduser(sys.argv[2]))
print(os.path.relpath(src, dst_dir))
PY
)
    fi
    ln -s "$link_src" "$2"
    success "linked $link_src to $2"
  fi
}


prop () {
   PROP_KEY=$1
   PROP_FILE=$2
   PROP_VALUE=$(eval echo "$(cat $PROP_FILE | grep "$PROP_KEY" | cut -d'=' -f2)")
   echo $PROP_VALUE
}

install_dotfiles () {
  local target=$1
  info "installing dotfiles${target:+ ($target)}"

  local overwrite_all=false backup_all=false skip_all=false

  if [ -n "$target" ]; then
    local linkfile="$DOTFILES/$target/links.prop"
    if [ ! -f "$linkfile" ]; then
      fail "No links.prop found in $target/"
    fi
    find_cmd="echo $linkfile"
  else
    find_cmd="find -H $DOTFILES -maxdepth 2 -name links.prop -not -path *.git*"
  fi

  eval "$find_cmd" | while read linkfile
  do
    cat "$linkfile" | while read line
    do
        local src dst dir
        src=$(eval echo "$line" | cut -d '=' -f 1)
        dst=$(eval echo "$line" | cut -d '=' -f 2)
        dir=$(dirname $dst)

        mkdir -p "$dir"
        link_file "$src" "$dst"
    done
  done
}

create_env_file () {
    if test -f "$HOME/.env.sh"; then
        success "$HOME/.env.sh file already exists, skipping"
    else
        echo "export DOTFILES=$DOTFILES" > $HOME/.env.sh
        success 'created ~/.env.sh'
    fi
}

install_dotfiles "$1"
if [ -z "$1" ]; then
  create_env_file
fi

echo ''
echo ''
success 'All installed!'
