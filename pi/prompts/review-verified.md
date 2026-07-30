---
description: Review changes and independently verify each credible finding
argument-hint: "[scope, diff, branch, or review focus]"
---
Review the following changes and return only actionable findings that survive independent verification:

$ARGUMENTS

Determine the appropriate review scope from the request and repository state. Inspect the relevant diff, surrounding implementation, tests, conventions, and call sites. Focus on correctness, regressions, security, data loss, concurrency, error handling, and meaningful performance problems. Do not report subjective style preferences unless they violate an explicit project rule or create a concrete maintenance risk.

Use a two-stage process:

1. **Candidate review:** Use one or more read-only subagents to inspect independent parts of the change and propose candidate findings with file paths, line references, impact, and supporting evidence.
2. **Independent verification:** For every credible candidate, assign a separate read-only verifier that did not originate the finding when practical. Give it the exact claim and ask it to confirm or disprove the issue by tracing the relevant code and, where safe and useful, running a targeted reproduction or test. For browser-facing claims, verify the behavior in a real browser when the application is runnable. Prefer the `d3k` skill for a runnable local application. Use `playwright-cli` for deployed or external applications and when Playwright-specific capabilities are needed.

Treat candidate findings as untrusted until verified. Discard findings that are speculative, subjective, already handled elsewhere, dependent on unsupported assumptions, or not introduced by the reviewed changes. Evaluate verifier conclusions yourself rather than forwarding them mechanically. Do not modify project files unless I explicitly ask you to fix the findings.

Report findings first, ordered by severity. For each confirmed finding include:

- Severity and concise title
- File and precise line or range
- User or system impact
- Why it is a real issue
- Verification evidence or reproduction
- Smallest reasonable fix direction

Then include:

- Discarded candidate count and brief reasons, without flooding the report
- Verification performed
- Remaining uncertainties or unverified areas

If no findings survive verification, say so clearly and mention any residual testing gaps.
