---
description: Scout relevant context, then create a concrete read-only plan
argument-hint: "<task>"
---
Use the `subagent` tool in a chain:

1. `scout` — investigate relevant files for:
   $ARGUMENTS
2. `planner` — create a concrete plan from the scout findings and the original task.

Keep the main-session final response concise and include only the synthesized plan and key risks.
