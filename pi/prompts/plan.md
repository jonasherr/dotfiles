---
description: Clarify requirements and produce a verified implementation plan before editing
argument-hint: "[task or goal]"
---
Plan the following work before implementing it:

$ARGUMENTS

Stay read-only. Do not edit project files or begin implementation.

First inspect the codebase and resolve anything that can be answered from existing code, documentation, configuration, history, or available tools. Use parallel subagents proactively when there are two or more independent investigation tracks.

Then load and follow the `grilling` skill. Work through consequential ambiguities, tradeoffs, assumptions, and acceptance criteria in dependency-aware rounds. Ask every currently answerable independent question in each round, include your recommended answer for each, and defer questions whose prerequisites are unsettled. Continue until we reach shared understanding.

Finally, present an implementation-ready plan containing:

1. Goal and agreed scope
2. Relevant existing behavior and files
3. Decisions and assumptions
4. Ordered implementation steps with file paths
5. Verification strategy, including exact commands or browser interactions where known
6. Risks, edge cases, and explicit non-goals

Wait for my approval before implementing.
