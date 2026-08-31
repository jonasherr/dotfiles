# Corepack and package-manager setup

**Question:** Is the Slack claim that we should stop using Corepack true, and what should change in this dotfiles setup?

**Checked:** Slack thread `CDABSG7RU`, plus current first-party Node.js, Corepack, pnpm, and Yarn sources.

## Executive summary

The claim is directionally true, but too broad:

- **Node.js is removing Corepack from the Node distribution starting with Node 25.** This means a future Node upgrade can remove the `corepack` executable that currently arrives with Node, along with the `pnpm` and `yarn` shims it provides.
- **Corepack itself is not dead.** It remains an independently installable and maintained project, and its documentation still recommends `packageManager` pins and documents `devEngines.packageManager`.
- **pnpm has a first-party standalone installer and Homebrew package.** pnpm's current installation docs no longer require Corepack and describe native self-update/version-management paths.
- **Yarn's current documentation still starts with `npm install -g corepack`.** Yarn Berry also stores its project-managed Yarn release in the repository, so Yarn projects can be made less dependent on a global Corepack installation.

For this machine, **do not make a disruptive change immediately**. Node 24 is currently active and the setup works. The prudent migration is to stop treating Corepack as an implicit part of Node, install the package managers through an explicit mechanism, and keep each project pinned.

## Evidence from the Slack thread

The thread says:

- “Please don't use corepack at all.”
- A reply says both pnpm and Yarn have turned away from Corepack.
- Another reply points to `fnm`/`nvm` as the Node installation mechanism.

This is useful internal guidance, but it is not a technical specification. The official sources support the narrower interpretation: **do not rely on Corepack being bundled with Node**.

## Primary-source findings

### Node.js

Node's v25 changelog records the semver-major change:

- “build: stop distributing Corepack”
- It also records documentation explaining the future Corepack removal in v25+.

Source: [Node.js v25 changelog](https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V25.md)

Node's current Corepack API page is also a useful historical reference, but the v25 changelog is the stronger evidence for the distribution change.

### Corepack

The Corepack repository is active and explicitly documents installing it independently with:

```sh
npm install -g corepack
```

It recommends declaring a project manager and exact version in `package.json` with `packageManager`, optionally including a hash. It also documents `devEngines.packageManager` for validation.

Sources:

- [Corepack README](https://github.com/nodejs/corepack)
- [Corepack packageManager documentation](https://github.com/nodejs/corepack#when-authoring-packages)

Important distinction: **Node no longer bundling Corepack does not mean the Corepack npm package has stopped existing.** It means the dependency on Node's distribution is being removed.

### pnpm

The current pnpm installation documentation provides all of these paths:

- standalone installer: `https://get.pnpm.io/install.sh`
- Homebrew: `brew install pnpm`
- npm bootstrap: `npx get-pnpm`
- native/self-managed update paths

It also notes that pnpm 12 can be installed as a native binary and does not need Node at runtime after installation. The docs continue to support `packageManager` pins for project-specific versions.

Source: [pnpm Installation](https://pnpm.io/installation)

### Yarn

Current Yarn documentation still recommends installing Corepack with npm, then using Yarn's project-version commands. Yarn's docs also say that source-built Yarn versions cannot leverage Corepack and instead store the release under `.yarn/releases` and reference it from `.yarnrc.yml`.

Sources:

- [Yarn Installation](https://yarnpkg.com/getting-started/install)
- [Yarn Corepack guide](https://yarnpkg.com/corepack)

Therefore, the Slack statement that Yarn has categorically abandoned Corepack is not supported by Yarn's current public documentation. It may describe an internal preference or an expected future direction.

## Audit of the current dotfiles setup

### What is working now

`zsh/.zshenv`:

- installs Homebrew's `node@24` path early
- sets `PNPM_HOME` to `$HOME/Library/pnpm`
- adds the fnm installation directory to `PATH`

`zsh/zsh.rc` later runs:

```sh
eval "$(fnm env --use-on-cd --shell zsh --log-level=quiet)"
```

The active shell currently resolves the tools as follows:

- Node: an fnm multishell path, version `v24.2.0`
- npm: the npm shipped with that Node installation, version `11.4.2`
- pnpm: an fnm-local Corepack shim, version `10.33.0`
- Yarn: an fnm-local Corepack shim, version `1.22.22`
- Corepack: an fnm-local installation, version `0.33.0`

The existing project pin in `pi/skills/personal/strava-cli/package.json` is good:

```json
"packageManager": "pnpm@10.11.0"
```

### Risks and inconsistencies

1. Before this migration, `pnpm` and `yarn` resolved through Corepack. The shell now gives Homebrew's pnpm precedence. Corepack shims were removed from the installed fnm Node versions, and Yarn is no longer available by command name.
2. `AGENTS.md` describes Corepack shims as a permanent part of the system setup. That documentation will become inaccurate after the migration.
3. `PNPM_HOME` is configured, but the current active pnpm is not coming from that directory. This makes the intended ownership unclear and can create PATH-order surprises if a standalone pnpm is later installed there.
4. The setup installs Homebrew `node@24` and also uses fnm. That can be intentional, but it creates two possible Node owners. The active shell currently chooses fnm's Node, while non-interactive tools may observe a different ordering.
5. Project pins are only useful if every project has one. The repository contains at least one explicit pnpm pin, and the global command now comes from Homebrew.

## Recommendation for this setup

### Recommended target

Use:

- **fnm** for Node versions
- **Homebrew's pnpm package** for pnpm, not the Corepack shim
- no Yarn in this setup
- `packageManager` in every JavaScript project
- optional `devEngines.packageManager` when the project needs an explicit mismatch policy

This separates Node lifecycle from package-manager lifecycle and avoids a Node 25 surprise.

### Low-risk migration plan

1. Keep unrelated worktree changes untouched. The package-manager changes made here are limited to the install script, shell PATH, Corepack configuration, and documentation.
2. Inventory projects and add/confirm exact `packageManager` values. Do not mass-convert projects between pnpm, Yarn, and npm.
3. Install a standalone pnpm through one deliberate owner, preferably Homebrew for this macOS dotfiles setup:

   ```sh
   brew install pnpm
   ```

   The official standalone installer is also valid, but do not install both variants.
4. Open a fresh shell and verify that `command -v pnpm` points to Homebrew, while `command -v yarn` and `command -v corepack` return nothing. Verify with `pnpm --version` and test the pinned `strava-local` project.
5. The Homebrew pnpm command has been confirmed. Corepack shims were removed from existing fnm Node installations; future installations are configured with `FNM_COREPACK_ENABLED=false`. No caches or package-manager state were deleted.
6. Update `AGENTS.md` and the relevant shell comments to describe the new ownership. The current shell keeps `PNPM_HOME` for compatibility with other tools, but Homebrew's pnpm is deliberately first in PATH.
7. Before moving to Node 25, test a clean shell and any Raycast/GUI-launched commands. Those may not load the same interactive `fnm` initialization as zsh.

### What I would not do

- I would not install `pnpm` globally with `npm install -g pnpm` while also leaving Corepack and `PNPM_HOME` competing on `PATH`.
- Corepack binaries have been removed from the existing fnm-managed Node installations because Corepack is not used in this setup. Future fnm installations have Corepack disabled.
- I would not change the package manager to npm just because Corepack is being removed from Node.
- I would not upgrade Node and change the package-manager installation in the same step without a rollback point.

## Bottom line

**True:** Corepack should no longer be assumed to be bundled with Node, because Node 25 removes it from the distribution.

**Not established:** Corepack is completely abandoned, or that pnpm and Yarn have both categorically rejected it. Their public documentation is more nuanced.

**Action:** Keep the working Node 24 setup and fnm. pnpm is installed explicitly through Homebrew, Corepack and Yarn shims are removed, future fnm installations have Corepack disabled, and the dotfiles documentation reflects that ownership. This is a compatibility hardening change, not an emergency rebuild.
