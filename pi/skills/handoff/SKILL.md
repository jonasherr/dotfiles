---
name: handoff
description: Compact the current conversation into a handoff for a fresh agent or session. Use when changing sessions, models, or owners while work remains.
disable-model-invocation: true
---

# Handoff

Summarize the current work so a fresh agent can continue without replaying the conversation.

Do not duplicate content already captured in specs, plans, ADRs, tracker tickets, commits, or diffs. Reference those artifacts by path or URL.

Include:

1. Goal and current state
2. Decisions already made
3. Work completed, with relevant paths and verification
4. Work remaining, ordered by the next useful action
5. Blockers, risks, and explicit uncertainty
6. Suggested skills for the next session
7. Critical artifact links and commands

Redact secrets, credentials, and unnecessary personal information.

If the user supplied arguments, treat them as the next session's intended focus and tailor the handoff accordingly.

## Output location

- If the handoff is for immediate use, return it directly in the conversation. Do not create a file.
- If a Wayfinder or tracker ticket is active, add the durable handoff there when tracker writes are authorized.
- If the user explicitly requests a file, use the managed `temporary_workspace` tool. Move the file to a user-approved durable location if it must persist, then delete the workspace.
- Never create files directly under `/tmp`, `$TMPDIR`, `tmp/`, or `temp/`.
