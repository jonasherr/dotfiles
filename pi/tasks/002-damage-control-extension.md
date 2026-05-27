# Task: Add damage-control extension guardrails

## Problem

Large tool-heavy sessions can accumulate enough context to trigger generic provider failures. When this happens, the user currently receives only a generic API error and may keep typing `continue`, creating an error loop.

There is already a Pi extension candidate at:

`extensions/damage-control.ts`

## Goal

Use a Pi extension to detect high-risk sessions, reduce context bloat, and guide recovery after provider errors.

## Scope

- `extensions/damage-control.ts`
- Pi extension hooks:
  - `agent_end`
  - `tool_result`
  - optionally `before_agent_start` or `context`

## Proposed changes

1. Detect failed assistant turns in `agent_end`:
   - `stopReason === "error"`
   - generic provider error message
   - `usage.totalTokens === 0`
2. Notify the user with a concrete recovery hint:
   - use `/tree` and retry from parent
   - compact before continuing
   - fork from last healthy turn
3. Track consecutive zero-token provider errors in extension state.
4. On the second consecutive provider error, recommend compaction or trigger `ctx.compact()` if safe.
5. Add `tool_result` truncation for huge outputs:
   - keep first N lines and last N lines
   - include byte/line counts
   - include the full output file path when Pi already saved one
6. Add high-risk output warnings for:
   - `.map` files
   - `node_modules`
   - generated build output
   - raw HTML/JSON blobs

## Suggested defaults

- Warn when a single tool result exceeds 20 KB.
- Compact/truncate when a single tool result exceeds 50 KB.
- Keep roughly 100 lines max per large tool result unless the user explicitly asks for full output.

## Acceptance criteria

- A provider error produces a clear user-facing recovery message.
- Two repeated zero-token provider errors trigger stronger recovery guidance.
- Huge bash/read outputs are summarized before entering model context.
- Tool output remains useful: enough detail for debugging, with path or command to inspect full output manually.

## Verification

- Run a command that prints more than 50 KB and verify the context receives a summarized result.
- Trigger or mock an assistant `stopReason: "error"` and verify the extension notification appears.
- Confirm normal small tool outputs are unchanged.

## Feedback follow-up

- Small JSON outputs must stay unchanged. The high-risk JSON/HTML/blob checks now only run once output is at least 20 KB.
- The `output exceeds 20.0 KB` reason is only emitted when the measured original output size is actually above 20 KB.
- Vendored/generated path checks only inspect direct file path subjects, not bash command text. A search command with `--glob '!node_modules/**'` no longer counts as node_modules output by itself.
