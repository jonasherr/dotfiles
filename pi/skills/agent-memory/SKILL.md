---
name: agent-memory
description: Persist agent learnings and manage cross-session memory. Use when discovering novel findings worth saving, when user says "remember this", "save this to memory", "note this down", "write a learning", "log this", or when completing a task and needing to write daily activity logs. Also use at session start when continuing ongoing work to check for relevant prior context.
---

# Agent Memory

Persist learnings, maintain daily activity logs, and manage cross-session memory.

## Agent Learnings

Cross-project learnings for future sessions — findings useful regardless of which project you're in.

### When to Write a Learning

Write a learning when you discover something **genuinely novel and reusable**:

- A non-obvious tool behavior or API quirk
- A debugging technique that solved a tricky problem
- A library pattern that isn't well-documented
- A configuration insight that took significant effort to find

**Do NOT write learnings for:**
- Obvious things ("TypeScript needs type annotations")
- Project-specific implementation details (those go in project AGENTS.md)
- Vault-specific patterns (those go in the vault's own knowledge base)

### Where to Write

Append to `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/areas/agent-learnings/inbox.md`
using this format:

```markdown
## YYYY-MM-DD — Title
**Agent**: agent name
**Session**: session_id
**Confidence**: high | medium | low
**Category**: tooling | library | debugging | pattern | configuration
**Related**: project name or context

Finding goes here. Keep it concise (3-5 sentences max).

---
```

## Memory Protocol

Agents maintain memory across sessions using three complementary systems:

### Daily Activity Logs

After completing a task or series of related changes, write to `areas/agent-learnings/daily/YYYY-MM-DD.md` (relative to vault root at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/`).

Format: three sections — Activity, Decisions, Key Context. The plugin auto-injects today's and yesterday's logs into every session.

### "Remember This" Requests

When the user says "remember this", "remember that", "save this to memory", or "note this down", write the content to today's daily log under `## Key Context`. Novel cross-project findings (tool quirks, library patterns) still go to `inbox.md`.

### Session Search

At the start of a session, if the user's request relates to ongoing work, use `session_search` to find relevant recent sessions for context.

### Per-Project Memory

Write ongoing project context to `.sisyphus/memory.md` (rolling file, relative to project root). Consolidate when it exceeds ~100 lines. The plugin auto-injects this into every session.

### Coexistence

- `inbox.md` = novel findings (tool quirks, library patterns)
- Daily logs = activity context
- `.sisyphus/memory.md` = project-specific ongoing state

Different purposes, all matter.
