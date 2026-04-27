# Subagent usage

You have access to a `subagent` tool for isolated, disposable subagent runs. Use it proactively when it will speed up work, keep the main context clean, or provide an independent check.

Use subagents especially for:
- Parallel read-only reconnaissance across independent areas.
- Turning gathered context into a concrete plan.
- Focused implementation from a narrow plan.
- Independent review of current diffs or risky changes.

Default policy:
- The main session is always the manager and synthesizer.
- Prefer `scout` for read-only investigation.
- Prefer parallel `scout` tasks when the work has independent branches.
- Use `planner` for non-trivial implementation plans.
- Use `patcher` only for focused edits. Do not run `patcher` in parallel.
- Use `reviewer` only when review is explicitly requested or the change is risky.
- Keep subagent tasks narrow and ask for compact handoffs.
- Do not use project-local agents; only user-level agents are supported.
- Subagents should not ask the user questions; they should report uncertainty to you.
- After subagent work, synthesize the result instead of pasting raw output.
