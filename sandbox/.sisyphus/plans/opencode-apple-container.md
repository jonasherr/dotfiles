# OpenCode in Apple Container — Secure Agent Sandbox

## TL;DR

> **Quick Summary**: Build a sandboxed OpenCode environment using Apple's native `container` CLI, where coding agents run with full permissions inside an isolated Linux microVM. User attaches TUI from the host to review/monitor work.
>
> **Deliverables**:
> - Containerfile that builds a Linux image with OpenCode, Bun, Node.js, Git, headless Chromium
> - Container-specific `opencode.json` config (all permissions "allow", Vercel provider, Playwriter MCP)
> - Container-specific `oh-my-opencode.json` (multi-agent orchestration)
> - Auth mount strategy using OpenCode's native `~/.local/share/opencode/auth.json`
> - `opencode-sandbox` wrapper script for one-command workflow
> - Entrypoint script for container initialization
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (Containerfile) → Task 4 (Wrapper Script) → Task 6 (Integration Test)

---

## Context

### Original Request
User wants to run OpenCode inside an Apple container to increase security when using coding agents. The container acts as a sandbox where the agent has full permissions (read, write, execute, git) without risk to the host system. User monitors progress via TUI attached from the host and reviews git commits.

### Interview Summary

**Key Discussions**:
- **Container Technology**: Apple `container` CLI (macOS 26, per-container microVM via Virtualization.framework)
- **Interaction Model**: `opencode serve` inside container, `opencode attach` from host TUI
- **Project Access**: Single project directory mounted per session via `--volume`
- **Config Strategy**: Minimal container config — no macOS plugins, all permissions "allow"
- **Result Workflow**: Git-based — agent commits inside container, user reviews from host
- **Agent Orchestration**: Full oh-my-opencode (Sisyphus, Oracle, Librarian, etc.)
- **Secrets**: Mount host's `~/.local/share/opencode/auth.json` (read-only) — this is where OpenCode natively stores provider credentials via `/connect`
- **Playwriter MCP**: Included — headless Chromium for browser automation
- **Ollama**: Excluded — cloud APIs only (Vercel provider)
- **Wrapper Script**: Full convenience script for one-command workflow

**Research Findings — Verified Syntax** (documentation fetched and read 2026-02-09, Apple container v0.9.x, OpenCode v1.1.x):

**Apple `container` CLI** (verified from `github.com/apple/container/blob/main/docs/how-to.md`):
- Volume mount syntax: `--volume ${HOME}/Desktop/assets:/content/assets` (full host path, colon, full container path)
- Alternative mount syntax: `--mount source=/host/path,target=/container/path`
- Port forwarding: `--publish 127.0.0.1:8080:8000` (format: `[host-ip:]host-port:container-port[/protocol]`)
  - Verified example from docs: `container run -d --rm -p 127.0.0.1:8080:8000 node:latest npx http-server -a :: -p 8000`
  - Tested with: `curl http://127.0.0.1:8080` → works
- Resource config: `--memory 4g --cpus 4` (default: 1GB RAM, 4 CPUs)
  - Verified: `container run --rm --cpus 8 --memory 32g big`
- Container inspect: `container ls --format json --all | jq '.[] | select(.status == "running") | [.id, .networks[0].address]'`
- Container networking: Each container gets dedicated IP on bridge network (default subnet 192.168.64.0/24)
  - But with `--publish`, traffic is forwarded from localhost — no need to discover container IP
- SSH forwarding: `--ssh` flag mounts SSH auth socket (for private repo cloning)
- Logs: `container logs <name>` for app logs, `container logs --boot <name>` for VM boot logs

**OpenCode Server** (verified from `opencode.ai/docs/server` and `opencode.ai/docs/cli`):
- Start headless server: `opencode serve [--port <number>] [--hostname <string>] [--cors <origin>]`
  - Default port: 4096, default hostname: 127.0.0.1
  - For container use: `opencode serve --port 4096 --hostname 0.0.0.0` (bind all interfaces)
- Health endpoint: `GET /global/health` → `{ healthy: true, version: string }`
- Attach TUI: `opencode attach [url]` — e.g., `opencode attach http://127.0.0.1:4096`
  - Flags: `--dir` (working directory), `--session` (session ID to continue)
- Auth: `OPENCODE_SERVER_PASSWORD` env var enables HTTP basic auth (username defaults to `opencode`)
- Events: `GET /event` → Server-Sent Events stream
- Config dir: `OPENCODE_CONFIG_DIR` env var overrides default `~/.config/opencode/`
- Other env vars: `OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_DISABLE_LSP_DOWNLOAD`, `OPENCODE_CLIENT`

**OpenCode Auth** (verified from `opencode.ai/docs/providers`):
- Credentials stored at: `~/.local/share/opencode/auth.json` (set via `/connect` command)
- Vercel AI Gateway: No explicit API key env var needed — uses auth.json natively

### Metis Review

**Identified Gaps** (addressed):
- Container persistence: Containers are ephemeral — only mounted project directory persists. Documented.
- Auth credentials: Mount host's `~/.local/share/opencode/auth.json` into container (standard OpenCode credential storage, set via `/connect`)
- Version pinning: OpenCode and oh-my-opencode versions pinned in Containerfile
- Container name collision: Wrapper script uses project-name + timestamp for unique names
- Git identity: Passed via env vars in wrapper script
- Chrome resource needs: Container runs with `--memory 4g --cpus 4` minimum

### Technical Notes (critical context for implementation)

**Auth.json Mount Strategy**:
- OpenCode reads `auth.json` at startup to load provider credentials
- **Decision**: Mount as **read-write** (no `:ro` flag). This avoids potential issues if OpenCode writes to auth.json (e.g., token refresh, session state). The security trade-off is minimal because:
  - The container is already isolated (per-container microVM)
  - auth.json only contains API keys, not broader system credentials
  - If the agent corrupts auth.json, the user can re-run `opencode auth login` to regenerate it
- The Vercel provider in the host config (`opencode/opencode.jsonc` line 94) uses API key auth, which doesn't require token refresh. But other providers (OAuth-based) might, so read-write is the safer default.

**Container Lifecycle Model**:
- **Project files**: Persist on host (mounted via `--volume`). Unaffected by container stop/remove.
- **Container state**: Ephemeral. Session history, LSP caches, downloaded packages inside container are lost on remove.
- **No orphaned resources**: Using bind mounts (not named volumes), no cleanup needed beyond `container rm`.
- **Safe to remove anytime**: `container stop <name> && container rm <name>` — project files remain intact on host.

**Disk Space Model**:
- Container VMs use host disk space (no separate disk allocation in Apple containers)
- Image: ~2-2.5GB, runtime: ~500MB-1GB (npm packages, LSP servers, Chromium cache)
- Project files are on host (not duplicated in container)
- Check host disk because container directly consumes host storage via Virtualization.framework

**Build Troubleshooting Guide** (common failures):
1. `Failed to fetch` / `Temporary failure resolving` → Network issue. Check internet connection.
2. `NO_PUBKEY` / GPG errors → NodeSource key may have changed. Try alternative: `curl -fsSL https://deb.nodesource.com/setup_22.x | bash -`
3. `No space left on device` → Run `container system prune` or free disk space.
4. `exec format error` → You're on Intel Mac (not supported). Requires Apple Silicon.
5. `playwright install failed` → Missing `--with-deps` flag, or network issue downloading Chromium.
6. `npm install` failures in `/config` → Check `container-package.json` is valid JSON. Run `jq . sandbox/container-package.json` to verify.
7. `cannot stat` / COPY errors → Build context mismatch. Ensure files from Tasks 2-3 exist in `sandbox/` before building.

---

## Work Objectives

### Core Objective
Create a fully functional, one-command sandboxed OpenCode environment using Apple's native `container` CLI, enabling coding agents to work with full permissions inside an isolated Linux microVM.

### Concrete Deliverables
- `sandbox/Containerfile` — OCI image definition
- `sandbox/entrypoint.sh` — Container startup script
- `sandbox/opencode.container.json` — Container-specific OpenCode config
- `sandbox/oh-my-opencode.container.json` — Container-specific agent orchestration config
- `sandbox/.gitignore` — Ensure no secrets leak
- `sandbox/opencode-sandbox` — Wrapper script (executable)

### Definition of Done
- [ ] `container build -t opencode-sandbox sandbox/` succeeds
- [ ] Wrapper script launches container, user can attach TUI from host
- [ ] Agent inside container can: read/write files, run shell commands, git commit
- [ ] Agent can call Anthropic/Vercel APIs via mounted `auth.json`
- [ ] Playwriter MCP can launch headless Chromium and take screenshots
- [ ] Stopping container leaves mounted project directory intact with agent's commits

### Must Have
- All OpenCode permissions set to "allow" (the whole point of sandboxing)
- Git available inside container with configurable identity
- Mounted project directory is the only shared state between host and container
- Secrets file mounted read-only
- Port forwarding for `opencode attach` from host
- Oh-my-opencode multi-agent orchestration
- Headless Chromium for Playwriter MCP

### Must NOT Have (Guardrails)
- **No Docker/Podman support** — Apple `container` CLI only
- **No Intel Mac support** — Apple Silicon only (arm64)
- **No Ollama/local models** — Cloud APIs only (Vercel provider)
- **No host home directory mount** — Single project directory only
- **No auto-push of git commits** — User reviews and pushes manually
- **No macOS-specific plugins** — No sound-notification, no terminal-notifier
- **No container orchestration** — Single container per session
- **No container health monitoring/auto-restart** — Keep it simple
- **No secrets in environment variables** — Use OpenCode's native `auth.json` mount (not visible in process list)
- **No hardcoded API keys anywhere** — Template + mount pattern only
- **No web UI mode** — TUI attach only (as discussed)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (no test framework needed for shell scripts + Containerfile)
- **User wants tests**: Manual-only (container builds, integration test via TUI)
- **Framework**: None — manual verification via CLI commands

### Manual QA Procedures

Each TODO includes specific verification steps. The overall integration test:

1. Build the image: `container build -t opencode-sandbox sandbox/`
2. Run the wrapper: `./sandbox/opencode-sandbox ~/Projects/some-test-project`
3. Attach TUI: `opencode attach http://127.0.0.1:4096`
4. In TUI, ask agent: "Create a file called test.txt with 'hello from sandbox'"
5. Verify on host: `cat ~/Projects/some-test-project/test.txt`
6. In TUI, ask agent: "Git commit the changes"
7. Verify on host: `cd ~/Projects/some-test-project && git log --oneline -1`
8. Stop container: `Ctrl+C` on wrapper script
9. Verify project intact: `ls ~/Projects/some-test-project/test.txt`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent file creation):
├── Task 1: Containerfile (references files from Tasks 2+3 via COPY, but build runs in Wave 3)
├── Task 2: Container-specific OpenCode config (opencode.container.json)
└── Task 3: Container-specific oh-my-opencode config + container-package.json

Wave 2 (After Wave 1 — scripts that reference the above files):
├── Task 4: Entrypoint script + wrapper script
└── Task 5: .gitignore + auth mount verification

Wave 3 (After Wave 2 — build + integration):
└── Task 6: Build image (needs ALL files from Tasks 1-5), integration test, fix issues

NOTE: Tasks 1, 2, 3 create files in parallel. The Containerfile COPY commands
reference files from Tasks 2+3, but `container build` only runs in Task 6.
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4, 6 | 2, 3 |
| 2 | None | 4, 6 | 1, 3 |
| 3 | None | 4, 6 | 1, 2 |
| 4 | 1, 2, 3 | 6 | 5 |
| 5 | None | 6 | 4 |
| 6 | 4, 5 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 3 | 3x parallel `delegate_task(category="quick", ...)` |
| 2 | 4, 5 | 2x parallel `delegate_task(category="unspecified-high", ...)` for wrapper, `quick` for template |
| 3 | 6 | `delegate_task(category="unspecified-high", ...)` — integration testing |

---

## TODOs

- [x] 1. Create Containerfile for OpenCode sandbox image

  **What to do**:
  - Create `sandbox/Containerfile` based on `debian:bookworm-slim` (glibc needed for Chromium and npm packages — Alpine uses musl which causes compatibility issues)
  - **Build context**: The `sandbox/` directory is the build context. Run from the dotfiles repo root: `container build -t opencode-sandbox sandbox/`. All COPY commands use paths relative to `sandbox/` (e.g., `COPY opencode.container.json /config/opencode.json` means `sandbox/opencode.container.json`).
  - Install system dependencies:
    ```dockerfile
    RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git ca-certificates jq openssh-client \
        && rm -rf /var/lib/apt/lists/*
    ```
  - Install Node.js 22 LTS via NodeSource (needed for npm/npx, OpenCode install, Playwriter):
    ```dockerfile
    # Node.js 22 LTS — using NodeSource GPG key approach (more robust than piping to bash)
    RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
        gpg --dearmor -o /usr/share/keyrings/nodesource.gpg && \
        echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > \
        /etc/apt/sources.list.d/nodesource.list && \
        apt-get update && apt-get install -y --no-install-recommends nodejs && \
        rm -rf /var/lib/apt/lists/*
    ```
    Alternative (simpler but pipes to bash): `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs`
    Either approach works in container context (running as root).
  - Install Bun runtime (needed for oh-my-opencode native binaries):
    ```dockerfile
    RUN curl -fsSL https://bun.sh/install | bash && \
        ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
        ln -s /root/.bun/bin/bunx /usr/local/bin/bunx
    ```
  - Install OpenCode via `npm install -g opencode-ai@latest` (pin to specific version)
  - Install Playwright's Chromium as a separate RUN layer (after Node.js install, before OpenCode config copy):
    ```dockerfile
    # Playwright + Chromium — separate layer for caching (~500MB)
    RUN npx playwright install --with-deps chromium
    ```
    This must run as root (default in container), after Node.js is installed (provides npx), and `--with-deps` installs OS-level dependencies (libglib, libnss, etc.)
  - Create `/workspace` directory as default working directory
  - Create `/config` directory for OpenCode config
  - Create `/root/.local/share/opencode/` directory as mount point for auth credentials (standard permissions, root-owned since container runs as root):
    ```dockerfile
    RUN mkdir -p /root/.local/share/opencode
    ```
  - Set `OPENCODE_CONFIG_DIR=/config` environment variable
  - Set `OPENCODE_DISABLE_AUTOUPDATE=true` (no auto-updates inside container)
  - Set `OPENCODE_DISABLE_LSP_DOWNLOAD=false` (let LSP servers auto-download)
  - Set `HOME=/root` (consistent home directory)
  - COPY config files into container image (source paths relative to build context `sandbox/`):
    ```dockerfile
    # Config files — created by Tasks 2 & 3 in sandbox/ directory
    COPY opencode.container.json /config/opencode.json
    COPY oh-my-opencode.container.json /config/oh-my-opencode.json
    COPY container-package.json /config/package.json
    ```
    **File locations on host**: Tasks 2 and 3 create these files directly in `sandbox/`:
    - `sandbox/opencode.container.json` → `COPY opencode.container.json` → `/config/opencode.json`
    - `sandbox/oh-my-opencode.container.json` → `COPY oh-my-opencode.container.json` → `/config/oh-my-opencode.json`
    - `sandbox/container-package.json` → `COPY container-package.json` → `/config/package.json`
    (All source paths are relative to the build context `sandbox/`, so no path prefix needed.)
  - Install plugins: `RUN cd /config && npm install` (installs oh-my-opencode and md-table-formatter)
  - **IMPORTANT — Build-time dependency clarification**:
    Task 1 creates the Containerfile TEXT which contains COPY instructions referencing files from Tasks 2 and 3 (e.g., `COPY opencode.container.json /config/opencode.json`).
    These COPY instructions do NOT execute when you write the Containerfile — they execute when `container build` runs in Task 6.
    Therefore: Task 1 (writing the Containerfile), Task 2 (writing the config), and Task 3 (writing the oh-my-opencode config) can all be created in parallel.
    The build (Task 6) runs AFTER all files exist.
  - Copy entrypoint script and set permissions:
    ```dockerfile
    COPY entrypoint.sh /entrypoint.sh
    RUN chmod +x /entrypoint.sh
    ```
    (Source: `sandbox/entrypoint.sh` on host → `/entrypoint.sh` inside container)
  - Expose port and set entrypoint:
    ```dockerfile
    EXPOSE 4096
    WORKDIR /workspace
    ENTRYPOINT ["/entrypoint.sh"]
    ```
    (No CMD needed — entrypoint.sh calls `exec opencode serve` directly)
  - Image optimization patterns to follow:
    - Use `--no-install-recommends` for ALL `apt-get install` commands
    - Always `rm -rf /var/lib/apt/lists/*` after apt-get operations (in same RUN layer)
    - Combine related apt-get commands into single RUN layers to reduce layer count
    - Keep Playwright + Chromium in its own RUN layer (~500MB, benefits from Docker layer caching)
    - Do NOT use multi-stage builds (not needed, adds complexity)
    - Expected total image size: ~2-2.5GB (Chromium alone is ~500MB, Node.js ~100MB, rest ~200MB, base ~70MB)

  **Must NOT do**:
  - Do NOT install Ollama or any local model runtime
  - Do NOT include macOS-specific tools (afplay, terminal-notifier)
  - Do NOT hardcode any API keys or secrets
  - Do NOT use Alpine (glibc needed for Chrome and many npm packages)
  - Do NOT run as root for the OpenCode process (create non-root user is optional — container isolation is sufficient)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Containerfile construction requires careful dependency ordering, layer optimization, and compatibility knowledge. Not purely frontend or quick.
  - **Skills**: [`git-master`]
    - `git-master`: Needed for committing the Containerfile to the repo
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not applicable — no UI work
    - `vercel-react-best-practices`: Not applicable — no React code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `opencode/install.sh` — Existing installation patterns for OpenCode (Homebrew-based, but shows what's needed)
  - `opencode/opencode.jsonc` — Reference for config structure (container version will be simplified)

  **API/Type References**:
  - Apple `container` CLI docs: `--volume`, `--publish`, `--memory`, `--cpus` flags
  - OpenCode CLI docs: `opencode serve --port 4096 --hostname 0.0.0.0`
  - OpenCode env vars: `OPENCODE_CONFIG_DIR`, `OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_SERVER_PASSWORD`

  **Documentation References**:
  - Apple container how-to: https://github.com/apple/container/blob/main/docs/how-to.md
    - Volume mount syntax: `--volume ${HOME}/path:/container/path`
    - Port publish syntax: `-p 127.0.0.1:8080:8000`
    - Memory/CPU config: `--memory 4g --cpus 4`
  - OpenCode docs: https://opencode.ai/docs/server — Server mode API and flags
  - OpenCode CLI: https://opencode.ai/docs/cli — All CLI commands and env vars

  **External References**:
  - Debian bookworm-slim: Base image for container
  - Node.js 22 LTS: https://nodejs.org/en/download — For npm/npx
  - Bun install: https://bun.sh/docs/installation — For oh-my-opencode
  - Playwright install: `npx playwright install --with-deps chromium`
  - Official OpenCode Docker image: `ghcr.io/anomalyco/opencode` (reference for patterns)

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `container build -t opencode-sandbox sandbox/` → builds successfully (exit code 0)
  - [ ] `container run --rm opencode-sandbox opencode --version` → prints OpenCode version
  - [ ] `container run --rm opencode-sandbox bun --version` → prints Bun version
  - [ ] `container run --rm opencode-sandbox git --version` → prints Git version
  - [ ] `container run --rm opencode-sandbox node --version` → prints Node.js version
  - [ ] `container run --rm opencode-sandbox npx playwright --version` → prints Playwright version
  - [ ] `container run --rm opencode-sandbox ls /root/.cache/ms-playwright/` → shows `chromium-XXXX` directory (Chromium is managed by Playwright internally, not a system binary)
  - [ ] `container run --rm opencode-sandbox node -e "const pw = require('playwright'); pw.chromium.launch({headless:true}).then(b => { console.log('Chromium OK'); return b.close(); }).catch(e => { console.error('FAIL:', e.message); process.exit(1); })"` → prints "Chromium OK" (exit 0). If prints "FAIL:", Chromium installation is broken.
  - [ ] `container run --rm opencode-sandbox cat /config/opencode.json` → shows valid config
  - [ ] Image size check: `container image ls` → image should be ~2-2.5GB (informational, no hard limit — Chromium alone is ~500MB)

  **Commit**: YES
  - Message: `sandbox: add Containerfile for OpenCode sandbox image`
  - Files: `sandbox/Containerfile`
  - Pre-commit: N/A (no tests)

---

- [x] 2. Create container-specific OpenCode config

  **What to do**:
  - Create `sandbox/opencode.container.json` — a stripped-down OpenCode config for container use
  - Set default model to `vercel/anthropic/claude-opus-4.6` (user's preferred model)
  - Configure Vercel provider (same as host — credentials come from mounted `auth.json`)
  - No need for `{file:...}` substitution — OpenCode reads `auth.json` natively from `~/.local/share/opencode/auth.json`
  - Set ALL permissions to `"allow"`. OpenCode supports setting all permissions at once with a single string value (verified from https://opencode.ai/docs/permissions, "Configuration" section):
    ```json
    "permission": "allow"
    ```
    This is the **simplest valid form** — a single string that sets ALL tools to "allow" (no per-tool overrides needed).
    Alternative (also valid, from same docs): `"permission": { "*": "ask", "bash": "allow" }` — but since we want EVERYTHING allowed in the sandbox, the single-string form is clearest.
    **Verification**: The docs explicitly show `"permission": "allow"` as a valid config under "You can also set all permissions at once".
  - Configure Playwriter MCP server (use array format for `command`, matching host config at `opencode/opencode.jsonc:130-134`):
    ```json
    "mcp": {
      "playwriter": {
        "type": "local",
        "command": ["npx", "-y", "playwriter@latest"]
      }
    }
    ```
  - Configure plugins: only `oh-my-opencode` and `@franlol/opencode-md-table-formatter` (no sound-notification)
  - Optional: The wrapper script can pass `--env OPENCODE_SERVER_PASSWORD=<value>` to enable HTTP basic auth on the server. Skip this for local-only use (port forwarding via `--publish 127.0.0.1:4096:4096` already limits access to localhost).
  - Disable auto-updates and auto-compact where appropriate
  - Keep config as minimal as possible — only what's needed for sandboxed operation
  - Use **strict JSON format** (no comments) and name it `opencode.container.json`. OpenCode reads `.json` natively. No `_comment` keys — keep it clean. If something needs explanation, document it in the Containerfile or wrapper script instead.

  **Must NOT do**:
  - Do NOT include sound-notification plugin (macOS-specific)
  - Do NOT include Ollama provider
  - Do NOT hardcode API keys anywhere — credentials come from mounted `auth.json` (native OpenCode storage)
  - Do NOT set permissions to "ask" (defeats purpose of sandbox — no one to ask)
  - Do NOT include keybinds (server mode, not TUI)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single config file creation, straightforward adaptation of existing config
  - **Skills**: []
    - No special skills needed — JSON file creation
  - **Skills Evaluated but Omitted**:
    - All skills: Not applicable for config file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `opencode/opencode.jsonc:1-end` — Full host OpenCode config. Container version strips macOS plugins, sets all permissions to "allow", removes Ollama provider, removes keybinds
  - Specifically study the `provider`, `mcp`, `plugin`, and `permission` sections

  **API/Type References**:
  - OpenCode config docs: https://opencode.ai/docs/config — Config schema
  - OpenCode permissions: https://opencode.ai/docs/permissions — Permission patterns
  - OpenCode MCP: https://opencode.ai/docs/mcp-servers — MCP server config format

  **Documentation References**:
  - OpenCode variable substitution: `{file:/path}` reads file contents as value
  - OpenCode env vars: `OPENCODE_CONFIG_DIR` for custom config location

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `cat sandbox/opencode.container.json | jq .` → valid JSON, parses without error
  - [ ] Verify `permission` key is `{"*": "allow"}`
  - [ ] Verify no `"sound-notification"` in plugin list
  - [ ] Verify no `"ollama"` in provider list
  - [ ] Verify no hardcoded API keys anywhere in the config file
  - [ ] Verify `mcp.playwriter` section exists with correct npx command

  **Commit**: YES (groups with Task 3)
  - Message: `sandbox: add container-specific OpenCode and oh-my-opencode configs`
  - Files: `sandbox/opencode.container.json`, `sandbox/oh-my-opencode.container.json`
  - Pre-commit: `cat sandbox/opencode.container.json | jq .`

---

- [x] 3. Create container-specific oh-my-opencode config

  **What to do**:
  - Create `sandbox/oh-my-opencode.container.json` — agent orchestration config for container
  - Copy structure from `opencode/oh-my-opencode.json` but adapt:
    - Keep all agent definitions (Sisyphus, Oracle, Librarian, Explore, etc.)
    - Keep all task categories (visual-engineering, ultrabrain, quick, etc.)
    - Keep model assignments per agent
    - Remove any macOS-specific references
  - This file should be functionally identical to the host version since agent orchestration is platform-independent
  - Create `sandbox/container-package.json` — minimal package.json for `/config` inside container:
    ```json
    {
      "dependencies": {
        "@franlol/opencode-md-table-formatter": "0.0.3",
        "oh-my-opencode": "latest"
      }
    }
    ```

  **Must NOT do**:
  - Do NOT modify agent logic or model assignments
  - Do NOT add container-specific agents (keep parity with host)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Copy + minor adaptation of existing JSON files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All skills: Simple file copy/adapt

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4, Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `opencode/oh-my-opencode.json:1-end` — Full host agent orchestration config. Container version should be identical or near-identical.
  - `opencode/package.json` — Host package.json showing dependencies needed

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `cat sandbox/oh-my-opencode.container.json | jq .` → valid JSON
  - [ ] `diff <(jq -S . opencode/oh-my-opencode.json) <(jq -S . sandbox/oh-my-opencode.container.json)` → shows minimal or no differences
  - [ ] `cat sandbox/container-package.json | jq .` → valid JSON with oh-my-opencode dependency

  **Commit**: YES (groups with Task 2)
  - Message: `sandbox: add container-specific OpenCode and oh-my-opencode configs`
  - Files: `sandbox/oh-my-opencode.container.json`, `sandbox/container-package.json`

---

- [x] 4. Create entrypoint script and wrapper script

  **What to do**:

  **Part A: `sandbox/entrypoint.sh`** (runs INSIDE the container)
  - Validate git identity env vars are set (FATAL if empty):
    ```bash
    if [ -z "$GIT_AUTHOR_NAME" ] || [ -z "$GIT_AUTHOR_EMAIL" ]; then
      echo "ERROR: Git identity not configured."
      echo "Set GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL environment variables."
      exit 1
    fi
    ```
  - Configure git from env vars:
    ```bash
    git config --global user.name "$GIT_AUTHOR_NAME"
    git config --global user.email "$GIT_AUTHOR_EMAIL"
    git config --global init.defaultBranch main
    ```
  - Validate auth credentials exist at `/root/.local/share/opencode/auth.json` (mounted from host):
    ```bash
    if [ ! -f /root/.local/share/opencode/auth.json ]; then
      echo "ERROR: Auth credentials not found."
      echo "Ensure auth.json is mounted from host."
      exit 1
    fi
    ```
  - Start OpenCode in server mode: `exec opencode serve --port 4096 --hostname 0.0.0.0`
  - Use `exec` so the OpenCode process receives signals directly
  - Make the script executable (`chmod +x`)

  **Part B: `sandbox/opencode-sandbox`** (runs on the HOST)
  - Accept project directory as argument: `./opencode-sandbox ~/Projects/my-app`
  - Validate prerequisites with explicit error handling for each check:
    ```bash
    # 1. Check container CLI — FATAL if missing
    if ! command -v container &> /dev/null; then
      echo "ERROR: 'container' CLI not found."
      echo "Install from: https://github.com/apple/container/releases"
      exit 1
    fi

    # 2. Check container system is running — FATAL if not
    if ! container system status &> /dev/null; then
      echo "ERROR: container system not running. Start with:"
      echo "  container system start"
      exit 1
    fi

    # 3. Check opencode CLI on host — FATAL if missing
    if ! command -v opencode &> /dev/null; then
      echo "ERROR: 'opencode' CLI not found. Install with:"
      echo "  brew install anomalyco/tap/opencode"
      exit 1
    fi

    # 4. Check project directory — FATAL if missing
    if [ ! -d "$project_dir" ]; then
      echo "ERROR: Project directory not found: $project_dir"
      exit 1
    fi

    # 5. Check git repo — WARN and ask to continue
    if ! git -C "$project_dir" rev-parse --git-dir > /dev/null 2>&1; then
      echo "WARNING: $project_dir is not a git repository."
      echo "Agent commits won't work without git."
      read -r -p "Continue anyway? [y/N] " response
      if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
      fi
    fi

    # 6. Check auth file — FATAL if missing
    local auth_file="${OPENCODE_AUTH_FILE:-$HOME/.local/share/opencode/auth.json}"
    if [ ! -f "$auth_file" ]; then
      echo "ERROR: Auth credentials not found at: $auth_file"
      echo "Run 'opencode auth login' to authenticate with your provider."
      exit 1
    fi

    # 7. Check disk space — WARN if low (uses macOS df)
    local free_gb
    free_gb=$(df -g / | awk 'NR==2{print $4}')
    if [ "$free_gb" -lt 5 ]; then
      echo "WARNING: Only ${free_gb}GB free disk space. Recommend at least 5GB."
      read -r -p "Continue anyway? [y/N] " response
      if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
      fi
    fi

    # 8. Check jq (needed for health check) — FATAL if missing
    if ! command -v jq &> /dev/null; then
      echo "ERROR: 'jq' not found. Install with:"
      echo "  brew install jq"
      exit 1
    fi

    # 9. Check curl (needed for health check) — FATAL if missing
    if ! command -v curl &> /dev/null; then
      echo "ERROR: 'curl' not found. Install with:"
      echo "  brew install curl"
      exit 1
    fi

    # 10. Check port 4096 is available — FATAL if in use
    if lsof -Pi :4096 -sTCP:LISTEN -t > /dev/null 2>&1; then
      echo "ERROR: Port 4096 is already in use."
      echo "Stop the process using it, or modify the script to use a different port."
      exit 1
    fi
    ```
  - Build image with proper error handling:
    ```bash
    # Check if image already exists
    if ! container image ls --format json 2>/dev/null | jq -e '.[] | select(.name == "opencode-sandbox:latest")' > /dev/null 2>&1; then
      echo "Building OpenCode sandbox image (this may take a few minutes on first run)..."
      if ! container build -t opencode-sandbox sandbox/; then
        echo "ERROR: Container image build failed."
        echo "Check the Containerfile for errors and try again."
        exit 1
      fi
      echo "Image built successfully."
    else
      echo "Using existing opencode-sandbox image."
      echo "To rebuild: container image rm opencode-sandbox:latest && re-run this script"
    fi
    ```
  - Generate unique container name: `opencode-$(basename "$project_dir")-$(date +%s)`
  - Check for and clean up existing containers for this project:
    ```bash
    # Find any existing opencode containers for this project
    local existing
    existing=$(container ls --format json 2>/dev/null | jq -r --arg prefix "opencode-$(basename "$project_dir")" '.[] | select(.id | startswith($prefix)) | .id' 2>/dev/null)
    if [ -n "$existing" ]; then
      echo "Found existing container(s) for this project:"
      echo "$existing"
      read -r -p "Stop and remove them? [Y/n] " response
      if [[ ! "$response" =~ ^[Nn]$ ]]; then
        echo "$existing" | while read -r cname; do
          container stop "$cname" 2>/dev/null
          container rm "$cname" 2>/dev/null
        done
      else
        echo "WARNING: Existing container may be using port 4096."
        echo "New container will fail to start if port is in use."
        # Re-check port after user declined cleanup
        if lsof -Pi :4096 -sTCP:LISTEN -t > /dev/null 2>&1; then
          echo "ERROR: Port 4096 is in use. Stop existing container first."
          exit 1
        fi
      fi
    fi
    ```
  - Start container:
    ```bash
    container run -d \
      --name "$container_name" \
      --memory 4g \
      --cpus 4 \
      --volume "$project_dir":/workspace \
      --volume "$auth_file":/root/.local/share/opencode/auth.json \
      --publish 127.0.0.1:4096:4096 \
      --env GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-OpenCode Agent}" \
      --env GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-agent@opencode-sandbox}" \
      --env GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-OpenCode Agent}" \
      --env GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-agent@opencode-sandbox}" \
      opencode-sandbox
    ```
  - Wait for container to be ready using a polling loop with 30-second timeout:
    ```bash
    # Health check polling — wait for OpenCode server to be ready
    local timeout=30
    local elapsed=0
    printf "Waiting for OpenCode server..."
    while [ "$elapsed" -lt "$timeout" ]; do
      # Check if container is still running (crash detection)
      if ! container inspect "$container_name" 2>/dev/null | jq -e '.[0].status == "running"' > /dev/null 2>&1; then
        echo " FAILED"
        echo "Container crashed during startup. Check logs:"
        echo "  container logs $container_name"
        echo "  container logs --boot $container_name"
        container rm "$container_name" 2>/dev/null
        exit 1
      fi
      # Check if OpenCode server is healthy
      if curl -sf http://127.0.0.1:4096/global/health | jq -e '.healthy == true' > /dev/null 2>&1; then
        echo " ready!"
        break
      fi
      sleep 1
      elapsed=$((elapsed + 1))
      printf "."
    done
    if [ "$elapsed" -ge "$timeout" ]; then
      echo " TIMEOUT after ${timeout}s"
      echo "Container may still be starting. Check logs:"
      echo "  container logs $container_name"
      exit 1
    fi
    ```
    - Before the server is ready: `curl` gets "connection refused" (server not listening yet)
    - When ready: returns `{"healthy":true,"version":"X.Y.Z"}`
    - On timeout: Exit with error, print log command for debugging
  - Print connection info:
    ```
    ✓ OpenCode sandbox running
    ✓ Project: ~/Projects/my-app → /workspace
    ✓ Container: opencode-my-app-1707500000
    ✓ Git identity: OpenCode Agent <agent@opencode-sandbox>
      (Override with: export GIT_AUTHOR_NAME='Your Name' GIT_AUTHOR_EMAIL='you@email.com')
    
    Attaching TUI... (Ctrl+C to detach, container keeps running)
    
    To reattach later:
      opencode attach http://127.0.0.1:4096
    
    To stop:
      container stop opencode-my-app-1707500000
      container rm opencode-my-app-1707500000
    ```
  - Auto-attach TUI: `opencode attach http://127.0.0.1:4096`
  - When `opencode attach` exits (user presses Ctrl+C or quits TUI), the script continues:
    ```bash
    # After TUI exits
    echo ""
    echo "TUI detached. Container '$container_name' is still running."
    read -r -p "Stop container now? [y/N] " response
    if [[ "$response" =~ ^[Yy]$ ]]; then
      echo "Stopping container..."
      container stop "$container_name"
      container rm "$container_name"
      echo "Container stopped and removed."
    else
      echo ""
      echo "Container still running. To reattach:"
      echo "  opencode attach http://127.0.0.1:4096"
      echo ""
      echo "To stop later:"
      echo "  container stop $container_name && container rm $container_name"
    fi
    ```
  - Use a `trap` for unexpected script termination (SIGINT/SIGTERM) to print container status
  - Make the script executable (`chmod +x`)
  - Follow dotfiles bash style: 2 spaces indent, quote all variables, use arrays for args

  **Must NOT do**:
  - Do NOT auto-push git commits
  - Do NOT auto-stop container on TUI detach (user might want to reattach)
  - Do NOT mount SSH agent by default (security consideration — add as optional flag)
  - Do NOT hardcode auth file path (use variable with default `~/.local/share/opencode/auth.json`)
  - Do NOT use `sudo` anywhere
  - Do NOT implement auto-rebuild/update logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Shell script with complex logic, error handling, user interaction, multiple validation steps
  - **Skills**: [`git-master`]
    - `git-master`: Needed for committing the scripts
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3 (needs Containerfile and configs to exist)

  **References**:

  **Pattern References**:
  - `opencode/install.sh` — Existing bash script patterns in the dotfiles (style, structure)
  - `install/bootstrap.sh` — Dotfiles bootstrap script (bash style reference)
  - Apple container how-to: https://github.com/apple/container/blob/main/docs/how-to.md
    - Volume mount syntax: `--volume ${HOME}/path:/container/path`
    - Port forwarding: `--publish 127.0.0.1:4096:4096`
    - Container inspect for IP: `container inspect <name> | jq '.[0].networks[0].address'`
    - Memory/CPUs: `--memory 4g --cpus 4`

  **API/Type References**:
  - OpenCode CLI attach: `opencode attach http://<host>:<port>`
  - OpenCode server health: `GET /global/health` → `{ healthy: true, version: string }`
  - OpenCode env vars: See full list at https://opencode.ai/docs/cli#environment-variables

  **Documentation References**:
  - Dotfiles AGENTS.md: "Bash: 2 spaces, quote all variables, use arrays for args"

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `bash -n sandbox/entrypoint.sh` → no syntax errors (exit code 0)
  - [ ] `bash -n sandbox/opencode-sandbox` → no syntax errors (exit code 0)
  - [ ] `file sandbox/entrypoint.sh` → shows executable permission
  - [ ] `file sandbox/opencode-sandbox` → shows executable permission
  - [ ] Run `./sandbox/opencode-sandbox` with no args → prints usage message
  - [ ] Run `./sandbox/opencode-sandbox /nonexistent` → prints error about missing directory
  - [ ] Run without auth.json → prints error about missing credentials with hint to run `opencode auth login`
  - [ ] Run with valid project dir → container starts, TUI attaches

  **Commit**: YES
  - Message: `sandbox: add entrypoint and wrapper scripts for container workflow`
  - Files: `sandbox/entrypoint.sh`, `sandbox/opencode-sandbox`
  - Pre-commit: `bash -n sandbox/entrypoint.sh && bash -n sandbox/opencode-sandbox`

---

- [x] 5. Create .gitignore and verify auth mount strategy

  **What to do**:
  - Create `sandbox/.gitignore` to exclude any accidentally created files:
    ```
    # Never commit credentials or secrets
    auth.json
    *.secrets
    *.env
    ```
  - **Auth Strategy** (IMPORTANT — no custom secrets file needed):
    - OpenCode natively stores provider credentials at `~/.local/share/opencode/auth.json`
    - These are set on the HOST via `opencode auth login` or `/connect` command
    - The wrapper script (Task 4) mounts this file read-only into the container:
      `--volume ~/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json`
    - The container's OpenCode reads `auth.json` natively — zero config needed
    - This means NO custom secrets file, NO env var injection, NO `{file:...}` substitution
    - The Vercel AI Gateway provider (which proxies to Anthropic, OpenAI, etc.) just works
  - Verify `opencode.container.json` (Task 2) does NOT reference any secrets — just the provider config structure

  **Must NOT do**:
  - Do NOT create a custom secrets file format (use OpenCode's native auth.json)
  - Do NOT put API keys in config files
  - Do NOT commit auth.json to the repo

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single .gitignore file + verification — minimal work
  - **Skills**: [`git-master`]
    - `git-master`: For committing
  - **Skills Evaluated but Omitted**:
    - All others: Not applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - OpenCode credential storage: `~/.local/share/opencode/auth.json` — standard location for all provider credentials
  - `opencode/opencode.jsonc:92-115` — Vercel provider config (no API keys in config, uses auth.json)

  **Documentation References**:
  - OpenCode providers: https://opencode.ai/docs/providers#credentials — "credentials are stored in `~/.local/share/opencode/auth.json`"

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] `cat sandbox/.gitignore` → excludes `auth.json` and secret files
  - [ ] `git status sandbox/` → no secrets or auth files tracked
  - [ ] Verify `~/.local/share/opencode/auth.json` exists on host: `jq . ~/.local/share/opencode/auth.json` → valid JSON with provider credentials
  - [ ] If auth.json doesn't exist: run `opencode auth login`, select your Vercel provider, authenticate
  - [ ] Test the mount works in a temporary container:
    ```bash
    container run --rm \
      --volume ~/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json \
      debian:bookworm-slim \
      cat /root/.local/share/opencode/auth.json
    ```
    → Should print the contents of auth.json (confirms mount works)

  **Commit**: YES
  - Message: `sandbox: add gitignore for container setup`
  - Files: `sandbox/.gitignore`

---

- [x] 6. Integration test — build image and verify end-to-end workflow

  **What to do**:
  - Build the container image: `container build -t opencode-sandbox sandbox/`
  - If build fails, debug and fix issues in Containerfile and configs
  - Create a temporary test project:
    ```bash
    mkdir -p /tmp/opencode-sandbox-test
    cd /tmp/opencode-sandbox-test
    git init
    echo "# Test Project" > README.md
    git add . && git commit -m "init"
    ```
  - Verify host has auth credentials:
    ```bash
    # Check that auth.json exists (from previous `opencode auth login`)
    cat ~/.local/share/opencode/auth.json | jq .
    ```
  - Test container manually:
    ```bash
    container run -d \
      --name test-opencode \
      --memory 4g \
      --cpus 4 \
      --volume /tmp/opencode-sandbox-test:/workspace \
      --volume ~/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json \
      --publish 127.0.0.1:4096:4096 \
      --env GIT_AUTHOR_NAME="Test Agent" \
      --env GIT_AUTHOR_EMAIL="test@sandbox" \
      --env GIT_COMMITTER_NAME="Test Agent" \
      --env GIT_COMMITTER_EMAIL="test@sandbox" \
      opencode-sandbox
    ```
  - Verify container health: `curl http://127.0.0.1:4096/global/health`
  - Attach TUI: `opencode attach http://127.0.0.1:4096`
  - Test agent can work: Ask it to create a file and commit
  - Verify Playwriter: Ask agent to take a screenshot of a webpage
  - Test wrapper script end-to-end with the test project
  - Clean up: `container stop test-opencode && container rm test-opencode`
  - Fix any issues discovered during testing
  - Document any caveats or known limitations discovered

  **Must NOT do**:
  - Do NOT leave test containers running after verification
  - Do NOT commit real API keys used in testing
  - Do NOT modify host files outside of sandbox/ directory

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing requires running real commands, debugging issues, iterating on fixes
  - **Skills**: [`git-master`]
    - `git-master`: For committing any fixes
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not applicable — we're testing the container, not a web app

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must be last)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 4, 5 (needs all files ready)

  **References**:

  **Pattern References**:
  - All files created in Tasks 1-5

  **API/Type References**:
  - OpenCode health endpoint: `GET /global/health` → `{ healthy: true, version: string }`
  - Apple container CLI: `container run`, `container stop`, `container rm`, `container ls`

  **Documentation References**:
  - Apple container how-to: https://github.com/apple/container/blob/main/docs/how-to.md
  - OpenCode server docs: https://opencode.ai/docs/server

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [ ] Container image builds: `container build -t opencode-sandbox sandbox/` → exit code 0, no error output
  - [ ] Container starts: `container run -d --name test-oc --memory 4g --cpus 4 --volume /tmp/opencode-sandbox-test:/workspace --volume ~/.local/share/opencode/auth.json:/root/.local/share/opencode/auth.json --publish 127.0.0.1:4096:4096 --env GIT_AUTHOR_NAME="Test" --env GIT_AUTHOR_EMAIL="test@test" --env GIT_COMMITTER_NAME="Test" --env GIT_COMMITTER_EMAIL="test@test" opencode-sandbox` → prints container ID
  - [ ] Health check passes: `curl -sf http://127.0.0.1:4096/global/health | jq .` → output contains `"healthy": true`
  - [ ] TUI attaches: `opencode attach http://127.0.0.1:4096` → TUI renders, shows OpenCode interface
  - [ ] Auth works: Send "hello" → agent responds within 30 seconds (no 401/403 errors). If you see "authentication failed" or "invalid credentials", check that `~/.local/share/opencode/auth.json` contains valid credentials (run `opencode auth login` on host to refresh)
  - [ ] Agent can modify files: Ask "Create a file called test.txt containing 'sandbox works'" → on host: `cat /tmp/opencode-sandbox-test/test.txt` shows "sandbox works"
  - [ ] Agent can git commit: Ask "Git add and commit test.txt" → on host: `git -C /tmp/opencode-sandbox-test log --oneline -1` shows a commit with the test file
  - [ ] Playwriter works: Ask "Take a screenshot of https://example.com and save it to /workspace/screenshot.png" → on host: `file /tmp/opencode-sandbox-test/screenshot.png` shows "PNG image data" and `ls -la /tmp/opencode-sandbox-test/screenshot.png` shows file size > 1KB
  - [ ] Container stops cleanly: `container stop test-oc` → exit code 0, no error output
  - [ ] Project directory intact: `ls /tmp/opencode-sandbox-test/test.txt /tmp/opencode-sandbox-test/screenshot.png` → both files exist
  - [ ] Container cleanup: `container rm test-oc` → exit code 0
  - [ ] Wrapper script works: `./sandbox/opencode-sandbox /tmp/opencode-sandbox-test` → full workflow (builds image if needed, starts container, attaches TUI)
  - [ ] No leftovers: `container ls --all` → no test-related containers remain

  **Commit**: YES (if any fixes were needed)
  - Message: `sandbox: fix issues discovered during integration testing`
  - Files: Any files modified during debugging

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `sandbox: add Containerfile for OpenCode sandbox image` | `sandbox/Containerfile` | `container build -t opencode-sandbox sandbox/` |
| 2+3 | `sandbox: add container-specific OpenCode and oh-my-opencode configs` | `sandbox/opencode.container.json`, `sandbox/oh-my-opencode.container.json`, `sandbox/container-package.json` | `jq . sandbox/*.json` |
| 4 | `sandbox: add entrypoint and wrapper scripts for container workflow` | `sandbox/entrypoint.sh`, `sandbox/opencode-sandbox` | `bash -n sandbox/*.sh` |
| 5 | `sandbox: add gitignore for container setup` | `sandbox/.gitignore` | `git status` |
| 6 | `sandbox: fix issues discovered during integration testing` (if needed) | Various | Full integration test |

---

## Success Criteria

### Verification Commands
```bash
# Build image
container build -t opencode-sandbox sandbox/

# Quick smoke test
container run --rm opencode-sandbox opencode --version  # Expected: opencode vX.Y.Z
container run --rm opencode-sandbox bun --version        # Expected: X.Y.Z
container run --rm opencode-sandbox git --version        # Expected: git version X.Y.Z

# Full integration (requires auth.json from `opencode auth login`)
./sandbox/opencode-sandbox /path/to/test/project  # Expected: TUI attaches, agent responds
```

### Final Checklist
- [ ] All "Must Have" present (full permissions, git, project mount, auth.json mount, oh-my-opencode, Chromium)
- [ ] All "Must NOT Have" absent (no Ollama, no macOS plugins, no hardcoded keys, no auto-push)
- [ ] Container builds in < 10 minutes
- [ ] Container starts in < 30 seconds
- [ ] Wrapper script validates all prerequisites before starting
- [ ] Agent can complete a full task cycle: read → modify → test → commit
- [ ] All files committed to sandbox/ directory
