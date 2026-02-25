# Vercel Sandbox Skill for OpenCode

## Overview
This skill enables OpenCode agents to provision on-demand Vercel Sandboxes and run a remote OpenCode server within them. Users can then connect their local terminal user interface (TUI) to the remote environment using the `opencode attach` command, providing a seamless development experience in a secure, isolated microVM.

## Architecture Diagram
```
┌─────────────────┐         ┌──────────────────────────────┐
│  Your Machine   │         │     Vercel Sandbox           │
│                 │         │     (Firecracker microVM)    │
│  opencode       │◄─REST──►│  opencode serve              │
│  attach <url>   │  +SSE   │  --hostname 0.0.0.0          │
│  (TUI client)   │         │  --port 3000                 │
└─────────────────┘         └──────────────────────────────┘
```

## Features
- On-demand sandbox creation with Vercel's Firecracker microVMs
- Connect local TUI to remote OpenCode via `opencode attach`
- Full sandbox lifecycle management (create, extend, cleanup)
- State persistence for reconnection across sessions
- Automatic timeout extension

## Prerequisites
- OpenCode installed (`npm i -g opencode-ai`)
- Vercel CLI installed (`npm i -g vercel`)
- Sandbox CLI installed (`npm i -g sandbox`)
- A Vercel account with sandbox access
- Authentication set up (`vercel link` + `vercel env pull`)

## Installation
```bash
# Copy skill to OpenCode skills directory
cp -r . ~/.config/opencode/skills/vercel-sandbox/
```
Or using skills CLI:
```bash
npx skills add <source> --skill vercel-sandbox -a opencode
```

## Usage
- Ask the agent to create a sandbox and it will handle the provisioning and setup.
- Run `opencode attach <url>` with the URL the agent provides to connect your local TUI.
- When done, ask the agent to clean up the sandbox to release resources.

## How It Works
1. Agent checks prerequisites (sandbox CLI, Vercel auth)
2. Creates a Vercel Sandbox with node24 runtime
3. Installs OpenCode inside the sandbox
4. Starts `opencode serve` in headless mode
5. Retrieves the preview URL
6. Presents the `opencode attach <url>` command to user
7. Manages timeout extensions automatically
8. Cleans up sandbox when user is done

## Vercel Sandbox Features
- Firecracker microVM isolation (stronger than containers)
- node24, node22, python3.13 runtimes
- Snapshot support for fast restarts
- Network firewall for egress control
- Up to 5 hours on Pro/Enterprise plans

## References
- [OpenCode Documentation](https://opencode.ai/docs)
- [Vercel Sandbox Documentation](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox SDK Reference](https://vercel.com/docs/vercel-sandbox/sdk-reference)
- [Sandbox CLI Reference](https://vercel.com/docs/vercel-sandbox/cli-reference)
- [Running AI-Generated Code in Sandbox](https://vercel.com/kb/guide/running-ai-generated-code-sandbox)
- [Using Vercel Sandbox with Claude Agent SDK](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk)

## License
Apache-2.0
