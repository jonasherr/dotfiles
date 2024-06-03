#!/bin/bash

# Function to create a tmux session with multiple windows from an associative array
create_session_with_windows() {
    local session_name=$1
    declare -n windows_paths=$2

    tmux has-session -t "$session_name" &> /dev/null

    if [ $? != 0 ]; then
        local first=true
        for window_name in "${!windows_paths[@]}"; do
            local window_path="${windows_paths[$window_name]}"
            if $first; then
                tmux new-session -d -s "$session_name" -n "$window_name" -c "$window_path"
                first=false
            else
                tmux new-window -t "$session_name" -n "$window_name" -c "$window_path"
            fi
        done
    else
        echo "Session $session_name already exists."
    fi
}

# Define windows and paths for session1
declare -A orh_windows=(
    [frontend]="/Users/jonas/Projects/paceteq/oneracehub-electron.git"
    [backend]="/Users/jonas/Projects/paceteq/oneracehub-api.git"
)

declare -A e1_windows=(
    [local]="/Users/jonas/Projects/e1-series-apps"
    [server]="/Users/jonas/Projects/e1-series-apps/local_backup"
)

declare -A settings_windows=(
    [tmux]="/Users/jonas"
    [nvim]="/Users/jonas/.config/nvim"
    [notes]="/Users/jonas/Library/Mobile Documents/iCloud~md~obsidian/Documents/Bear"
    [paperless]="/Users/jonas/Projects/paperless-ngx"
    [karabiner]="/Users/jonas/Projects/karabiner"
)

declare -A nextjsexample_windows=(
    [nextjs]="/Users/jonas/WebstormProjects/nextjs-example"
)

# Create the sessions
create_session_with_windows "orh" orh_windows
create_session_with_windows "e1" e1_windows
create_session_with_windows "settings" settings_windows
create_session_with_windows "nextjs example" nextjsexample_windows

tmux attach -t "orh"
