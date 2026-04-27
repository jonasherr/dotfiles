---
description: Scout, plan, then apply a focused patch without automatic review
argument-hint: "<task>"
---
Use the `subagent` tool in a chain:

1. `scout` — find the relevant files and constraints for:
   $ARGUMENTS
2. `planner` — create a concrete implementation plan from the scout findings and original task.
3. `patcher` — implement only that plan.

After the chain completes, inspect the resulting diff in the main session and run appropriate verification yourself. Do not automatically run `reviewer` unless I explicitly ask.
