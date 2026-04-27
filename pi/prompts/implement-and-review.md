---
description: Scout, plan, patch, then run an explicit independent review
argument-hint: "<task>"
---
Use the `subagent` tool in a chain:

1. `scout` — find the relevant files and constraints for:
   $ARGUMENTS
2. `planner` — create a concrete implementation plan.
3. `patcher` — implement only that plan.
4. `reviewer` — review the resulting diff and verification state.

After the chain completes, synthesize the outcome in the main session, inspect the diff, and fix any reviewer `needs-fix` items.
