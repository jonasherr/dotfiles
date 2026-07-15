---
description: Clarify requirements and produce a verified implementation plan before editing
argument-hint: "[task or goal]"
---
Plan the following work before implementing it:

$ARGUMENTS

Stay read-only. Do not edit project files or begin implementation.

First inspect the codebase and resolve anything that can be answered from existing code, documentation, configuration, history, or available tools. Use parallel subagents proactively when there are two or more independent investigation tracks.

Then load and follow the `grill-me` skill. Interview me one question at a time about every consequential ambiguity, tradeoff, assumption, and acceptance criterion that cannot be resolved from the codebase. For each question, include your recommended answer. Continue until we reach shared understanding.

Finally, present an implementation-ready plan containing:

1. Goal and agreed scope
2. Relevant existing behavior and files
3. Decisions and assumptions
4. Ordered implementation steps with file paths
5. Verification strategy, including exact commands or browser interactions where known
6. Risks, edge cases, and explicit non-goals

Wait for my approval before implementing.
