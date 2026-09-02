import assert from "node:assert/strict";
import test from "node:test";

import {
  isWriteEnabledSubagent,
  resolveSubagentTools,
  TEMPORARY_WORKSPACE_TOOLS,
} from "./subagent-tools.ts";
import { readFile } from "node:fs/promises";

test("adds managed temporary workspace tools to an explicit allowlist", () => {
  assert.deepEqual(resolveSubagentTools({ tools: ["bash", "read"] }), [
    "bash",
    "read",
    ...TEMPORARY_WORKSPACE_TOOLS,
  ]);
});

test("does not duplicate explicitly included temporary workspace tools", () => {
  assert.deepEqual(
    resolveSubagentTools({
      tools: ["read", "temporary_workspace_create"],
    }),
    ["read", ...TEMPORARY_WORKSPACE_TOOLS],
  );
});

test("keeps managed temporary workspace tools in default tool sets", () => {
  for (const tools of [
    resolveSubagentTools({}),
    resolveSubagentTools({ readOnly: false }),
  ]) {
    for (const tool of TEMPORARY_WORKSPACE_TOOLS) {
      assert.ok(tools.includes(tool));
    }
  }
});

test("allows callers to set the child subagent thinking level", async () => {
  const source = await readFile(new URL("../subagent/index.ts", import.meta.url), "utf8")
  assert.match(source, /thinking\?: ThinkingLevel/)
  assert.match(source, /thinking: options\.thinking \?\? "low"/)
  assert.match(source, /thinking: task\.thinking \?\? "low"/)
  assert.match(source, /"--thinking",\n    result\.thinking/)
  assert.match(source, /Set thinking per task; it defaults to low/)
})

test("keeps the child subagent scratch-file policy explicit", async () => {
  const source = await readFile(new URL("../subagent/index.ts", import.meta.url), "utf8")
  assert.match(source, /Before creating any disposable file/)
  assert.match(source, /temporary_workspace_create/)
  assert.match(source, /Never create scratch files under \/tmp/)
  assert.match(source, /temporary_workspace_delete/)
  assert.match(source, /REQUIRED_CHILD_EXTENSIONS/)
  assert.match(source, /--extension/)
  assert.match(source, /temporary-workspace\.ts/)
})

test("classifies resolved read-only tools as not write-enabled", () => {
  assert.equal(isWriteEnabledSubagent(resolveSubagentTools({})), false);
});

test("classifies resolved write tools as write-enabled", () => {
  assert.equal(
    isWriteEnabledSubagent(resolveSubagentTools({ readOnly: false })),
    true,
  );
});

test("classifies explicit tool lists based on edit or write", () => {
  assert.equal(
    isWriteEnabledSubagent(resolveSubagentTools({ tools: ["bash"] })),
    false,
  );
  assert.equal(
    isWriteEnabledSubagent(resolveSubagentTools({ tools: ["edit"] })),
    true,
  );
  assert.equal(
    isWriteEnabledSubagent(resolveSubagentTools({ tools: ["write"] })),
    true,
  );
});
