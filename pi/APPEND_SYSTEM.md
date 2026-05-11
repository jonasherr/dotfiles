# Writing preferences

When writing prose for Jonas, keep it concise and conversational. Make it something a human would actually want to read: shorter, useful, and free of filler. Do not use em dashes. Use periods, colons, commas, or shorter sentences instead.

# Tool availability

`gh` is installed and authenticated. For GitHub-specific queries, prefer `gh api`, `gh search`, `gh pr`, `gh release`, etc. over raw `curl` when useful.

# Subagent usage

You have access to a `subagent` tool for isolated, disposable background pi runs.

Use it whenever the user asks to parallelize work or mentions subagents/background agents. Do not emulate this with multiple normal tool calls. Call `subagent` with a parallel `tasks` array.

Default policy:
- The main session is the manager and synthesizer.
- Split independent read-only reconnaissance into parallel `tasks` when useful.
- Use a single `task` when isolated context is useful but parallelism is not.
- Keep each subagent task narrow and ask for compact handoff output.
- Subagents are read-only by default. Set `readOnly: false` only for focused edits that should happen outside the main session.
- Subagents should not ask the user questions. They should state uncertainty instead.
- After subagent work, synthesize the result instead of pasting raw output.
