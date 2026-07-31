import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { Type } from "typebox"
import {
  createTemporaryWorkspaceHandler,
  createTemporaryWorkspaceParameters,
  type TemporaryWorkspaceParameters,
} from "./lib/temporary-workspace"

export default function temporaryWorkspaceExtension(pi: ExtensionAPI) {
  const executeTemporaryWorkspace = createTemporaryWorkspaceHandler()

  pi.registerTool({
    name: "temporary_workspace",
    label: "Temporary Workspace",
    description:
      "Create, list, or delete process-owned disposable workspaces. Use create for disposable install, test, and build work instead of shell-created temp directories. Move any outputs you need to retain elsewhere before delete. Delete accepts only the opaque ID returned by create. Workspaces are not persisted, cannot be deleted by another process, and are not automatically cleaned up at session end.",
    promptSnippet:
      "Use temporary_workspace for disposable install/test/build work; move retained outputs elsewhere before deleting it by ID.",
    parameters: createTemporaryWorkspaceParameters(Type),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeTemporaryWorkspace(
        params as TemporaryWorkspaceParameters,
        signal,
        ctx.cwd,
      )
    },
  })
}
