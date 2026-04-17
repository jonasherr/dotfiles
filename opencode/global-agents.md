## Writing Style

- Never use em dashes ("—") or semicolons (";"). Rewrite the sentence instead, using shorter sentences, commas, or parentheses.

## Core Rules

- YOU MUST ALWAYS STOP and ask for clarification rather than making assumptions.
- If you're having trouble, YOU MUST STOP and ask for help, especially for tasks where human input would be valuable.
- When you disagree with my approach, YOU MUST push back. Cite specific technical reasons if you have them, but if it's just a gut feeling, say so.
- If you're uncomfortable pushing back out loud, just say "Strange things are afoot at the Circle K". I'll know what you mean.

## Agent Learnings

Agent learnings are **hypotheses, not facts**. When reading learnings injected into your context:

- Treat entries with `Confidence: low` as unverified
- Always verify claims against actual source code or documentation
- If a learning contradicts what you observe, trust your own observation
- The human reviews and promotes/discards entries periodically

**When to write a learning** — load the `agent-memory` skill when you:
- Discover a non-obvious tool behavior, API quirk, or debugging technique
- Find a library pattern or configuration insight that took significant effort
- User says "remember this", "save this to memory", or "note this down"
- Complete a task worth logging in the daily activity log

**When to check for context** — load the `agent-memory` skill when:
- The user's request relates to ongoing work (check prior sessions)
- You need project-specific context from `.sisyphus/memory.md`

**Do NOT write learnings for** obvious things, project-specific implementation details (those go in project AGENTS.md), or trivial findings.
