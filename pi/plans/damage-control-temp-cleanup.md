# Managed temporary workspace design

## Final design

Temporary cleanup is a capability exposed by the `temporary_workspace` Pi custom tool, not a shell-command exemption.

The tool uses one Google-provider-compatible, closed `Type.Object` schema. Its `action` string enum has three values and `id` is optional at the schema level. Runtime validation enforces the action-dependent contract: `delete` requires a non-empty ID, while `create` and `list` reject an ID.

- `create` creates a directory with `mkdtemp()` beneath a dedicated `pi-managed-workspaces` root under Node's `node:os` `tmpdir()`. It returns an opaque random ID and the path; the ID is generated independently of the path.
- `list` returns only currently live and deletable workspaces in this extension instance's in-memory ownership registry.
- `delete` accepts only an ID. It cannot accept or derive authority from a caller-provided path.

Agents should use managed workspaces for disposable dependency installation, tests, and builds. Outputs that must survive need to be moved elsewhere before deletion.

## Ownership and lifecycle

Ownership is process-local and memory-only. There is no persistence, discovery of another process's directories, cross-process deletion, or automatic session-end cleanup. Reloading/restarting the extension loses deletion authority. This intentionally favors a small capability boundary over broad temp-directory cleanup.

An ID remains registered until deletion succeeds. Deletes for the same ID are serialized. Validation, rename, post-rename validation, or `/bin/rm` failures retain the capability for retry and diagnosis. After a successful rename, the registry stores the quarantine path, so a removal failure can retry that exact owned entry. `list` omits missing or replaced entries because they are no longer live workspaces.

## Deletion safety contract

Each serialized deletion first revalidates the trusted stored entry. A fresh entry must have the `workspace-` prefix; a retry may instead have the quarantine prefix. Validation requires:

1. The managed root is a mode `0700` real directory owned by the current UID and still resolves to the same device/inode identity recorded by this manager.
2. The stored path is a strict component-aware descendant of that root.
3. Its basename has the expected prefix and a non-empty generated suffix.
4. It is not `/`, home, cwd, or the managed root, and neither canonical home nor canonical cwd is equal to or beneath the workspace. A workspace containing either protected location is not renamed and is omitted from `list` because it cannot safely be deleted.
5. `lstat()` reports a real directory, not a symlink.
6. Its device and inode match the identity captured at creation.
7. Its device matches the managed root device.

For a fresh workspace, the manager then atomically renames the directory to a fresh unpredictable quarantine basename under the already validated managed root, updates the registry to that quarantine path, and repeats all identity, real-directory, same-device, canonical-path, strict-containment, and expected-prefix checks. Any failed or indeterminate check fails closed without invoking removal. The implementation invokes absolute macOS `/bin/rm` with `execFile`, `shell: false`, fixed arguments `-rfx --`, and only the stored post-rename validated quarantine path. The tool's `AbortSignal` is forwarded through Node's supported `execFile` `signal` option. No shell command is constructed.

The final post-quarantine identity `lstat()` is the last awaited operation before starting the fixed `/bin/rm`; no unrelated async work is placed in that interval. The unpredictable quarantine name, private mode-`0700` managed root, root identity/ownership checks, and final workspace identity check substantially narrow the validation-to-delete replacement window and catch stale or replaced entries.

### Threat model

This protects against accidental model path misuse, caller-controlled paths, stale registry entries, and entries replaced before the final identity check. It does **not** claim to protect against a concurrently malicious same-UID process that can mutate the private managed root. Such a process can replace the quarantine pathname after validation, before or while `/bin/rm` resolves it. Node's pathname APIs cannot eliminate that race; doing so requires descriptor-relative deletion or native filesystem APIs, which are intentionally out of scope.

## Damage-control behavior

`damage-control` has no special allow path for recursive temp deletion. The `temporary_workspace` custom tool does not match any damage-control prompt rule, while arbitrary recursive `bash` `rm` remains reviewed or hard-blocked by the existing shell safety logic.

The only shell-detector change is the independent false-positive fix: standalone Python `tempfile.TemporaryDirectory()` construction/cleanup is not treated as mount cleanup. Actual `shutil.rmtree()` and namespace/mount commands combined with explicit recursive cleanup remain detected.

## Focused tests

`extensions/lib/temporary-workspace.test.ts` covers:

- create/list/delete lifecycle and the exact non-shell `/bin/rm` call
- unknown random IDs and repeated deletion
- one Google-compatible object schema with an action enum, optional ID, no path parameter, and no additional properties
- runtime rejection of missing/empty delete IDs, IDs on create/list, and unsupported actions
- separate extension manager ownership registries
- rejection of a managed root that is not mode `0700`
- symlink and directory identity replacement
- workspaces equal to or containing canonical cwd/home are omitted from list and rejected without rename or removal
- deletion failure retention of the quarantine capability and successful retry
- concurrent same-ID deletion serialization
- swaps during rename and after rename fail closed without passing replacements to removal
- registered tool execution rejects on errors rather than returning a successful result

`extensions/lib/damage-control-safety.test.ts` retains arbitrary recursive `rm`, `shutil.rmtree()`, and namespace cleanup coverage while locking the standalone `TemporaryDirectory()` fix.

## Verification

Run from `pi/`:

```bash
tsx --test extensions/lib/damage-control-safety.test.ts extensions/lib/temporary-workspace.test.ts
npx prettier --check --no-semi extensions/temporary-workspace.ts extensions/lib/temporary-workspace.ts extensions/lib/temporary-workspace.test.ts
git diff --check -- extensions plans/damage-control-temp-cleanup.md
```
