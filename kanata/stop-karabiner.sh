#!/usr/bin/env bash
set -euo pipefail

UID_NUM="$(id -u)"
USER_DOMAIN="gui/$UID_NUM"

# Karabiner's VirtualHIDDevice daemon is intentionally not stopped. Kanata
# needs it for its output keyboard; only Karabiner's remapping services go.
USER_LABELS=(
  org.pqrs.service.agent.Karabiner-Console-User-Server
  org.pqrs.service.agent.Karabiner-Core-Service-rev2
  org.pqrs.service.agent.Karabiner-Core-Service
  org.pqrs.service.agent.karabiner_console_user_server
  org.pqrs.service.agent.karabiner_session_monitor
  org.pqrs.service.agent.karabiner_grabber
  org.pqrs.karabiner.agent.karabiner_grabber
)

SYSTEM_LABELS=(
  org.pqrs.service.daemon.Karabiner-Core-Service
  org.pqrs.service.agent.karabiner_session_monitor
  org.pqrs.karabiner.karabiner_grabber
  org.pqrs.karabiner.karabiner_observer
  org.pqrs.service.daemon.karabiner_grabber
  org.pqrs.service.daemon.karabiner_observer
)

REMAP_PROCESS_PATTERN='/Karabiner-Elements\.app/|/Karabiner-(Console-User-Server|Core-Service)\.app/|/(karabiner_(grabber|observer|session_monitor|console_user_server))([[:space:]]|$)'

printf 'Stopping Karabiner remapping services...\n\n'
osascript -e 'quit app "Karabiner-Elements"' 2>/dev/null || true
sleep 2

for label in "${USER_LABELS[@]}"; do
  launchctl bootout "$USER_DOMAIN/$label" >/dev/null 2>&1 || true
  launchctl disable "$USER_DOMAIN/$label" >/dev/null 2>&1 || true
done

printf 'Stopping system remapping services (sudo may ask for your password)...\n'
for label in "${SYSTEM_LABELS[@]}"; do
  sudo launchctl bootout "system/$label" >/dev/null 2>&1 || true
  sudo launchctl disable "system/$label" >/dev/null 2>&1 || true
done

sleep 2
printf 'Force stopping remaining remapping processes...\n'
sudo killall -9 \
  Karabiner-Elements \
  Karabiner-Console-User-Server \
  Karabiner-Core-Service \
  karabiner_console_user_server \
  karabiner_session_monitor \
  karabiner_grabber \
  karabiner_observer \
  2>/dev/null || true

printf '\nStatus:\n'
if pgrep -f "$REMAP_PROCESS_PATTERN" >/dev/null 2>&1; then
  printf 'WARNING: Karabiner remapping processes are still running:\n'
  pgrep -alf "$REMAP_PROCESS_PATTERN" || true
  exit 1
fi

printf 'Karabiner remapping is stopped.\n'
printf 'The VirtualHIDDevice driver daemon was left running for Kanata.\n'
