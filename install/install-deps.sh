#!/bin/zsh

source ./install-deps-macos.sh

git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k
git clone https://github.com/asdf-vm/asdf.git $HOME/.asdf --branch v0.18.0

source $HOME/.asdf/asdf.sh

asdf plugin add nodejs
NODEJS_CHECK_SIGNATURES=no asdf install nodejs 22.13.1
asdf global nodejs $(asdf list nodejs | tail -1 | sed 's/^ *//g')
