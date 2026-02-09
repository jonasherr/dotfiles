#!/usr/bin/env bash
#
# OpenCode Sandbox — Container Entrypoint
#
# Runs INSIDE the container. Validates environment, configures git,
# and starts the OpenCode server in headless mode.

set -euo pipefail

# ── Validate git identity ─────────────────────────────────────────────
if [ -z "${GIT_AUTHOR_NAME:-}" ] || [ -z "${GIT_AUTHOR_EMAIL:-}" ]; then
  echo "ERROR: Git identity not configured."
  echo "Set GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL environment variables."
  exit 1
fi

# ── Configure git ─────────────────────────────────────────────────────
git config --global user.name "$GIT_AUTHOR_NAME"
git config --global user.email "$GIT_AUTHOR_EMAIL"
git config --global init.defaultBranch main

# Also set committer if provided (falls back to author)
if [ -n "${GIT_COMMITTER_NAME:-}" ]; then
  git config --global committer.name "$GIT_COMMITTER_NAME"
fi
if [ -n "${GIT_COMMITTER_EMAIL:-}" ]; then
  git config --global committer.email "$GIT_COMMITTER_EMAIL"
fi

# ── Validate auth credentials ─────────────────────────────────────────
if [ ! -f /root/.local/share/opencode/auth.json ]; then
  echo "ERROR: Auth credentials not found at /root/.local/share/opencode/auth.json"
  echo "Ensure auth.json is mounted from host:"
  echo "  --volume ~/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json"
  exit 1
fi

# ── Start socat relay ─────────────────────────────────────────────────
# Bridge Unix socket to TCP for --publish-socket forwarding
# (Apple container --publish TCP port forwarding is broken for HTTP)
socat UNIX-LISTEN:/tmp/opencode.sock,fork,reuseaddr TCP:127.0.0.1:4096 &

# ── Start OpenCode server ─────────────────────────────────────────────
# exec replaces this shell so OpenCode receives signals directly
exec opencode serve --port 4096 --hostname 0.0.0.0
