#!/usr/bin/env bash

set -euo pipefail

workspace_label="${1:?workspace label required}"
workspace_cwd="${2:?workspace cwd required}"

workspace_id="$(herdr workspace list | python3 -c '
import json
import sys

label = sys.argv[1]
try:
    response = json.load(sys.stdin)
except json.JSONDecodeError:
    raise SystemExit(1)

for workspace in response.get("result", {}).get("workspaces", []):
    if workspace.get("label") == label:
        print(workspace["workspace_id"])
        break
' "$workspace_label")"

if [[ -z "$workspace_id" ]]; then
  workspace_id="$(herdr workspace create --label "$workspace_label" --cwd "$workspace_cwd" --focus | python3 -c '
import json
import sys

response = json.load(sys.stdin)
print(response["result"]["workspace"]["workspace_id"])
')"
else
  herdr workspace focus "$workspace_id" >/dev/null
fi

# Open a Kitty client with the Herdr startup session. `open -a kitty` only
# activates an existing app and does not create a client window reliably.
open -a kitty --args --single-instance --session "$HOME/.config/kitty/sessions/startup.kitty-session"
