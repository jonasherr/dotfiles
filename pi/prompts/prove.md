---
description: Prove that the current implementation works with concrete evidence
argument-hint: "[claim, task, or expected behavior]"
---
Prove that the current implementation works:

$ARGUMENTS

Do not rely on the implementation's apparent correctness or on a successful build alone. Inspect the relevant diff and determine the strongest practical verification path. Compare against the base branch or reproduce the original failure when useful.

Run the narrowest relevant checks, such as targeted tests, type checks, syntax checks, builds, logs, or a direct reproduction. For frontend or browser-facing behavior, load the `playwright-cli` skill, open the rendered application in a real browser, exercise the changed interaction and important UI states, and inspect console or network output when relevant. If the application cannot be run or accessed, say so explicitly rather than implying browser verification occurred.

For a substantial change or a claim with independent parts, use read-only parallel subagents to verify those parts independently. Ask them for evidence and evaluate their conclusions yourself.

If verification exposes a defect and the intended behavior is clear, fix it and repeat the checks. If the intended behavior is ambiguous, stop and ask me rather than changing it speculatively.

Report:

1. Verdict
2. Evidence collected
3. Commands and browser interactions used
4. Failures found and fixes made
5. Anything still unverified, with the reason
