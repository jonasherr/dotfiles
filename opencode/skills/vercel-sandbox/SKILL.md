---
name: vercel-sandbox
description: >-
  Manage Vercel Sandbox with OpenCode server for remote cloud development.
  Use when the user requests a cloud sandbox, remote development environment,
  isolated execution environment, or wants to run OpenCode in a Vercel Sandbox.
  Handles full lifecycle: create sandbox, install OpenCode, start server,
  present connection URL, auto-extend timeout, cleanup. Triggers on
  "sandbox", "remote environment", "cloud dev", "isolated environment",
  "vercel sandbox".
allowed-tools: Bash(sandbox:*) Bash(opencode:*) Bash(vercel:*)
---

# Vercel Sandbox with OpenCode

Run OpenCode in a Vercel Sandbox and connect via `opencode attach`.

## ⚠️ Security: MANDATORY Authentication

**Published sandbox ports are PUBLIC URLs.** Anyone with the URL can access the OpenCode server.
Authentication MUST be enabled on every sandbox. **NEVER start a server without a password.**

OpenCode supports HTTP basic auth via `OPENCODE_SERVER_PASSWORD` env var:
- Set on the server: `OPENCODE_SERVER_PASSWORD=<random>` when starting `opencode serve`
- Set on the client: `opencode attach --password <random> <url>`
- Username defaults to `opencode` (override with `OPENCODE_SERVER_USERNAME`)

**Password generation** — generate a random password for each sandbox session:

```bash
# Generate a 32-character random password
SANDBOX_PASSWORD=$(openssl rand -base64 24)
```

The password is stored in `.sandbox-state.json` so reconnection works without re-entering it.

## Prerequisites

Run these checks before any sandbox operation:

```bash
# Check sandbox CLI
sandbox --version
# If not installed: npm install -g sandbox

# Check Vercel auth
vercel whoami
# If not authenticated: guide user to run `vercel link` + `vercel env pull`
```

## Project & Scope Resolution

The sandbox CLI creates sandboxes under a specific Vercel project and team.
By default it uses the project linked in the current directory (`.vercel/project.json`).

### Preferences File

Persistent preferences are stored in `~/.config/vercel-sandbox/preferences.json`:

```json
{
  "default_project": "my-default-app",
  "default_scope": "my-team",
  "snapshot_id": "snap_heVENHK5jxl2If9vqbJTpWe6MwGS",
  "directories": {
    "/Users/me/Projects/frontend": {
      "project": "frontend-app",
      "scope": "frontend-team"
    },
    "/Users/me/Projects/api": {
      "project": "api-service"
    }
  }
}
```

- `default_project` / `default_scope` — global fallbacks used when no directory-specific or explicit override exists
- `directories` — per-directory overrides keyed by absolute path. Partial matches are NOT supported (exact match only).
- All fields are optional. Omit what you don't need.
- The file is created automatically when the user sets preferences (see Managing Preferences below).
- `snapshot_id` — pre-built snapshot with OpenCode, config, auth, and skills pre-installed. When set, new sandboxes start from this snapshot instantly (skipping install + config copy). Created via the Snapshots workflow below.

### Resolution Order

Resolve project/scope by checking these sources **in order** (first match wins):

1. **Explicit** — user provides project/team in their message → use those
2. **Per-directory** — `directories[cwd]` in `~/.config/vercel-sandbox/preferences.json` → use `project` / `scope`
3. **Global default** — `default_project` / `default_scope` in preferences.json
4. **Environment** — `VERCEL_SANDBOX_PROJECT` / `VERCEL_SANDBOX_SCOPE` env vars
5. **Linked project** — `.vercel/project.json` in working directory (native sandbox CLI behavior)
6. **None** — no project resolved → **ASK the user** before proceeding

Project and scope resolve independently. For example, per-directory may set `project` but not `scope`,
in which case `scope` continues down the chain to global default, then env var, then linked project.

```bash
# Step 1: Read preferences file
cat ~/.config/vercel-sandbox/preferences.json 2>/dev/null || echo '{}'

# Step 2: Check for directory-specific override using $PWD as key
# Step 3: Fall back to default_project / default_scope
# Step 4: Check env vars
# Step 5: Check .vercel/project.json
cat .vercel/project.json 2>/dev/null || echo "No linked project"

# Step 6: If still nothing resolved, ASK:
# "Which Vercel project should this sandbox run under?"
# "You can pass a project name (e.g. my-app) or project ID (e.g. prj_xxx)."
# "You can also specify a team with --scope."
# "Want to save this as default? (I can save it globally or for this directory)"
```

### Managing Preferences

When the user says "set default project", "save sandbox preferences", "remember this project",
or agrees to save after being asked, update the preferences file:

```bash
# Create config directory if needed
mkdir -p ~/.config/vercel-sandbox

# Set global default
# Read existing, merge, write back (use jq or python for safe JSON editing)
cat ~/.config/vercel-sandbox/preferences.json 2>/dev/null || echo '{}' | \
  jq --arg p "my-app" --arg s "my-team" '. + {default_project: $p, default_scope: $s}' \
  > ~/.config/vercel-sandbox/preferences.json.tmp && \
  mv ~/.config/vercel-sandbox/preferences.json.tmp ~/.config/vercel-sandbox/preferences.json

# Set per-directory override (uses $PWD as key)
cat ~/.config/vercel-sandbox/preferences.json 2>/dev/null || echo '{}' | \
  jq --arg dir "$PWD" --arg p "frontend-app" \
  '.directories[$dir] = {project: $p}' \
  > ~/.config/vercel-sandbox/preferences.json.tmp && \
  mv ~/.config/vercel-sandbox/preferences.json.tmp ~/.config/vercel-sandbox/preferences.json

# Remove a directory override
cat ~/.config/vercel-sandbox/preferences.json 2>/dev/null || echo '{}' | \
  jq --arg dir "$PWD" 'del(.directories[$dir])' \
  > ~/.config/vercel-sandbox/preferences.json.tmp && \
  mv ~/.config/vercel-sandbox/preferences.json.tmp ~/.config/vercel-sandbox/preferences.json

# Show current preferences
cat ~/.config/vercel-sandbox/preferences.json 2>/dev/null || echo "No preferences set"
```

**After resolving a project for the first time via prompt**, always offer to save:
- "Want me to save this as your default project?"
- "Want me to save this for this directory (`$PWD`)?"

## Decision Tree

Follow this on every sandbox-related request:

```
User requests sandbox -->
  |-- Resolve project/scope (see above)
  |-- Check .sandbox-state.json exists?
  |   |-- YES --> Validate sandbox still alive (sandbox list --json, check ID exists)
  |   |   |-- ALIVE --> Present existing URL, extend timeout
  |   |   +-- DEAD --> Delete stale state file, proceed to CREATE NEW
  |   +-- NO --> CREATE NEW
  |
CREATE NEW -->
  |-- Check snapshot exists in preferences?
  |   |-- YES (has snapshot_id) --> Create from snapshot (FAST PATH)
  |   +-- NO --> Create from scratch (SLOW PATH)
  |
FAST PATH (from snapshot) -->
  |-- 1. sandbox create --snapshot <snap_id> --publish-port 3000 --timeout 30m [--project <P>] [--scope <T>]
  |-- 2. Capture sandbox ID and published URL from output
  |-- 3. Generate random password: SANDBOX_PASSWORD=$(openssl rand -base64 24)
  |-- 4. Set up credentials brokering via REST API
  |-- 5. Start server: OPENCODE_SERVER_PASSWORD=<pass> opencode serve ...
  |-- 6. Wait 5 seconds, verify health
  |-- 7. Save state to .sandbox-state.json
  +-- 8. Present URL + attach command WITH --password flag
  |
SLOW PATH (from scratch) -->
  |-- 1. sandbox create --runtime node24 --publish-port 3000 --timeout 30m [--project <P>] [--scope <T>]
  |-- 2. Capture sandbox ID and published URL from output
  |-- 3. Generate random password: SANDBOX_PASSWORD=$(openssl rand -base64 24)
  |-- 4. sudo npm install -g opencode-ai
  |-- 5. Copy OpenCode config, auth, and skills into sandbox (see Configure Sandbox)
  |-- 6. Take snapshot for future fast starts (see Snapshots)
  |-- 7. Set up credentials brokering via REST API
  |-- 8. Start server: OPENCODE_SERVER_PASSWORD=<pass> opencode serve ...
  |-- 9. Wait 5 seconds, verify health
  |-- 10. Save state to .sandbox-state.json (include snapshot_id)
  +-- 11. Present URL + attach command WITH --password flag
```

## Sandbox Creation

```bash
# Build the create command with optional project/scope flags
# NOTE: Use --publish-port (NOT --port). --timeout accepts human-readable durations like 30m, 1h.
# Base command:
sandbox create --runtime node24 --publish-port 3000 --timeout 30m

# With explicit project:
sandbox create --runtime node24 --publish-port 3000 --timeout 30m --project my-app

# With explicit project and team:
sandbox create --runtime node24 --publish-port 3000 --timeout 30m --project my-app --scope my-team

# Capture the sandbox ID and published URL from CLI output
# Output format: Sandbox sbx_xxx created. ... ports: • 3000 -> https://sb-xxx.vercel.run
# Parse sandbox_id matching pattern sbx_[a-zA-Z0-9]+
# Parse published URL matching pattern https://sb-[a-z0-9]+\.vercel\.run
```

## Install OpenCode in Sandbox

```bash
sandbox exec <SANDBOX_ID> -- sudo npm install -g opencode-ai
# Wait for completion, verify exit code 0
```

## Configure Sandbox

After installing OpenCode, provision the host's configuration and set up credentials brokering.

### Copy OpenCode Config

The sandbox runs as user `vercel-sandbox` with home at `/home/vercel-sandbox`.
Copy the host's config and auth into the sandbox using `sandbox cp`:

```bash
# Copy OpenCode config (model definitions, keybinds, provider settings)
# Config goes to $HOME/.config/opencode/
sandbox cp [--scope <T>] ~/.config/opencode/opencode.jsonc <SANDBOX_ID>:/home/vercel-sandbox/.config/opencode/opencode.jsonc

# Copy auth credentials (AI Gateway API key)
# Auth goes to $HOME/.local/share/opencode/
sandbox cp [--scope <T>] ~/.local/share/opencode/auth.json <SANDBOX_ID>:/home/vercel-sandbox/.local/share/opencode/auth.json

# Optionally copy skills directory (if host has skills configured)
# Note: sandbox cp works for individual files. For directories, tar + pipe:
tar -cf - -C ~/.config/opencode skills | sandbox exec [--scope <T>] <SANDBOX_ID> -- tar -xf - -C /home/vercel-sandbox/.config/opencode/
```

- Config goes to `$HOME/.config/opencode/` inside the sandbox
- Auth goes to `$HOME/.local/share/opencode/` inside the sandbox
- Skills copy is optional but recommended — without skills, the sandbox OpenCode instance won't have any agent skills available

### Set Up Credentials Brokering (Defense-in-Depth)

After copying config, call the Vercel REST API to set up credentials brokering. This injects the AI Gateway API key at the firewall proxy layer, so even if code in the sandbox tries to exfiltrate the key, the real auth happens outside the VM.

**⚠️ Requires Vercel Pro or Enterprise plan.** If brokering setup fails (e.g. free plan), fall back to auth.json only and warn the user that credentials are inside the sandbox without firewall-level protection.

```bash
# Get the AI Gateway API key from local auth.json
AI_KEY=$(jq -r '.vercel.key' ~/.local/share/opencode/auth.json)

# Get a Vercel auth token for the API call
# macOS: ~/Library/Application Support/com.vercel.cli/auth.json
# Linux: ~/.local/share/com.vercel.cli/auth.json
VERCEL_TOKEN=$(jq -r '.token' "$HOME/Library/Application Support/com.vercel.cli/auth.json" 2>/dev/null || jq -r '.token' ~/.local/share/com.vercel.cli/auth.json 2>/dev/null)

# Set network policy with credentials brokering via REST API
# mode "default-allow" = allow all traffic + inject credentials for specific domains
curl -s -X POST "https://api.vercel.com/v1/sandboxes/${SANDBOX_ID}/network-policy?slug=${SCOPE}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "default-allow",
    "injectionRules": [{
      "domain": "ai-gateway.vercel.sh",
      "headers": {
        "Authorization": "Bearer '"${AI_KEY}"'"
      }
    }]
  }'
```

Key points:
- `mode: "default-allow"` allows all outbound traffic (needed for npm install, etc.) while still injecting credentials for specific domains
- `injectionRules` tells the firewall proxy to inject the `Authorization` header on HTTPS requests to `ai-gateway.vercel.sh`
- The sandbox code never sees the raw API key in the injected header — it's added at the firewall layer outside the VM
- This is defense-in-depth: `auth.json` is also copied (OpenCode needs it to discover providers), but the firewall ensures auth even if the file is compromised
- The CLI doesn't support transform rules yet — must use the REST API directly
- `vercel token` or reading from `~/.local/share/com.vercel.cli/auth.json` gets the Vercel access token for the API call

**Important:** The `OPENCODE_SERVER_PASSWORD` on the published port is SEPARATE from credentials brokering. The server password protects the OpenCode HTTP server endpoint (who can connect to the TUI), while credentials brokering protects the AI Gateway API key (how the sandbox authenticates with AI models).

## Snapshots

Snapshots save the full sandbox filesystem state — OpenCode binary, config, auth, skills — so new sandboxes
start instantly without re-installing or copying files. **This is the recommended workflow.**

### Creating a Snapshot (SLOW PATH — run once)

After configuring a sandbox from scratch (install OpenCode + copy config/auth/skills), snapshot it:

```bash
# Take a snapshot (stops the sandbox)
sandbox snapshot <SANDBOX_ID> --scope <T> --stop --expiration 0
# --expiration 0 = never expires
# Output: Snapshot snap_xxx created.

# Save the snapshot ID to preferences for future use
cat ~/.config/vercel-sandbox/preferences.json | \
  jq --arg snap "snap_xxx" '. + {snapshot_id: $snap}' \
  > ~/.config/vercel-sandbox/preferences.json.tmp && \
  mv ~/.config/vercel-sandbox/preferences.json.tmp ~/.config/vercel-sandbox/preferences.json
```

### Using a Snapshot (FAST PATH — every subsequent time)

```bash
# Read snapshot_id from preferences
SNAPSHOT_ID=$(jq -r '.snapshot_id // empty' ~/.config/vercel-sandbox/preferences.json)

# Create sandbox from snapshot — OpenCode + config + auth + skills are already there
sandbox create --snapshot "$SNAPSHOT_ID" --publish-port 3000 --timeout 30m [--project <P>] [--scope <T>]
```

### When to Rebuild the Snapshot

Rebuild the snapshot (run SLOW PATH again) when:
- OpenCode has a new version you want (`sudo npm install -g opencode-ai@latest`)
- You changed your `opencode.jsonc` config
- You added/removed skills
- Your auth credentials changed

### Listing and Managing Snapshots

```bash
# List all snapshots
sandbox snapshots list --scope <T>

# Delete an old snapshot
sandbox snapshots delete <snap_id> --scope <T>
```

## Start OpenCode Server (WITH AUTH)

**⚠️ MANDATORY: Always set OPENCODE_SERVER_PASSWORD. Never skip this.**

```bash
# Generate a random password for this session
SANDBOX_PASSWORD=$(openssl rand -base64 24)

# Start OpenCode with authentication enabled
# NOTE: All sandbox exec commands MUST include --scope if scope was used during create
sandbox exec [--scope <T>] <SANDBOX_ID> -- bash -c \
  'OPENCODE_SERVER_PASSWORD='"$SANDBOX_PASSWORD"' nohup opencode serve --hostname 0.0.0.0 --port 3000 > /tmp/opencode.log 2>&1 &'

# Wait 5 seconds for server startup
sleep 5

# Verify server is running (health endpoint does NOT require auth)
sandbox exec [--scope <T>] <SANDBOX_ID> -- curl -s http://localhost:3000/global/health || echo "Server starting..."
```

## Present URL to User

After successful creation, present **both the URL and the attach command with --password**:

```
✅ Vercel Sandbox is ready!

Connect your local OpenCode TUI (password is included):
  opencode attach --password '<SANDBOX_PASSWORD>' https://sb-xxx.vercel.run

Or attach with env var:
  OPENCODE_SERVER_PASSWORD='<SANDBOX_PASSWORD>' opencode attach https://sb-xxx.vercel.run

Sandbox ID: sbx_abc123
Project: my-app (team: my-team) — source: global_pref
Timeout: 30 minutes (auto-extending)
🔒 Server is password-protected
```

**NEVER show the bare URL without the password/attach command.**
Users need the password to connect — showing just the URL is useless and misleading.

## State File Management

Write `.sandbox-state.json` in the working directory after successful creation:

```json
{
  "sandbox_id": "sbx_abc123",
  "created_at": "2026-02-17T10:30:00Z",
  "opencode_url": "https://sb-xxx.vercel.run",
  "port": 3000,
  "password": "<generated-random-password>",
  "scope": "my-team",
  "source": "global_pref",
  "snapshot": "snap_heVENHK5jxl2If9vqbJTpWe6MwGS",
  "credentials_brokering": true
}
```

- Write after successful creation
- Read on reconnection attempts — use stored `password` to reconnect without prompting
- Delete on cleanup
- Path: `.sandbox-state.json` (working directory)
- `project`, `scope`, and `source` fields are optional
- `password` field is ALWAYS present — required for reconnection
- `credentials_brokering` field tracks whether firewall-level credentials brokering was configured (may be `false` on free plans)
- `snapshot` field records which snapshot was used (if any) — useful for debugging

## Timeout Extension

Extend the sandbox timeout whenever it is still in use (before executing commands, after user requests):

```bash
# Extend by 10 minutes (600000ms)
sandbox extend <SANDBOX_ID> --timeout 600000
```

## Cleanup

When user says "stop sandbox", "clean up", or "destroy sandbox":

```bash
sandbox stop <SANDBOX_ID>
# Delete state file
rm .sandbox-state.json
```

Present confirmation: "Sandbox <SANDBOX_ID> stopped and cleaned up."

## Error Handling

| Error | Response |
|-------|----------|
| `sandbox: command not found` | Install the sandbox CLI: `npm install -g sandbox` |
| Auth failure from `vercel whoami` | Run `vercel link` and `vercel env pull` to authenticate |
| Sandbox creation fails (quota) | Sandbox creation failed. Check your Vercel plan limits at vercel.com/docs/vercel-sandbox/pricing |
| `opencode serve` fails to start | OpenCode server failed to start. Check logs: `sandbox exec <ID> -- cat /tmp/opencode.log` |
| Stale sandbox (state file exists but sandbox is gone) | Delete `.sandbox-state.json`, offer to create a new sandbox |
| No project resolved from any source | Ask user which Vercel project to use, then offer to save as global default or directory preference |
| REST API call to set network policy failed | Check Vercel auth token. Run `vercel login` if expired. Verify team has Pro/Enterprise plan (required for credentials brokering). Fall back to auth.json only and warn user. |

## Reconnection

When `.sandbox-state.json` exists, validate before reusing:

```bash
# Read sandbox ID from .sandbox-state.json
# Check if sandbox still exists using JSON output
sandbox list --json
# Parse the JSON array and check if any object has id matching <SANDBOX_ID>
# If found: extend timeout and present URL
# If not found: delete .sandbox-state.json and create new
```