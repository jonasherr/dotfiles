#!/bin/bash
PATH_VALUE=$(echo $PATH)
CONFIG_FILE="$HOME/.config/kitty/macos-launch-services-cmdline"
echo "--override env=PATH=\"$PATH_VALUE\"" > "$CONFIG_FILE"
