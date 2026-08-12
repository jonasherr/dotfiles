export const TEMPORARY_WORKSPACE_TOOLS = [
  "temporary_workspace_create",
  "temporary_workspace_list",
  "temporary_workspace_delete",
];

export const READ_ONLY_SUBAGENT_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  ...TEMPORARY_WORKSPACE_TOOLS,
];

export const WRITE_SUBAGENT_TOOLS = [
  ...READ_ONLY_SUBAGENT_TOOLS,
  "edit",
  "write",
];

export function resolveSubagentTools(options: {
  tools?: string[];
  readOnly?: boolean;
}): string[] {
  if (options.tools && options.tools.length > 0) {
    return [...new Set([...options.tools, ...TEMPORARY_WORKSPACE_TOOLS])];
  }

  return options.readOnly === false
    ? WRITE_SUBAGENT_TOOLS
    : READ_ONLY_SUBAGENT_TOOLS;
}
