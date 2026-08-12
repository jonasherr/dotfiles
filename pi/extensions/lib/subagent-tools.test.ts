import assert from "node:assert/strict";
import test from "node:test";

import {
  isWriteEnabledSubagent,
  resolveSubagentTools,
  TEMPORARY_WORKSPACE_TOOLS,
} from "./subagent-tools.ts";

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
