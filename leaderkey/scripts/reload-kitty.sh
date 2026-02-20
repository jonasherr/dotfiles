#!/usr/bin/env bash
set -e
kill -SIGUSR1 $(pgrep -f kitty) 2>/dev/null
