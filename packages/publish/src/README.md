# publish/src

## Overview

The `conciv-publish` citty command tree. It runs release guards (workspace root, changesets, public package set, catalog usage, changeset coverage), versions and publishes through changesets and turbo, reconciles npm with `PUBLIC_PACKAGES` (first publish, trusted publishing, git tags), and mirrors `native/swift` into the `conciv-dev/conciv-swift` repository.

## Interface

- `main` command `conciv-publish` (`cli.ts`), run through `runMain(main)`, with subcommands:
  - `version`: `assertChangesetsResolve`, `pnpm exec changeset version`, `pnpm install --lockfile-only`.
  - `check-changesets` (`--require-coverage`, `--base <ref>`): `assertChangesetsResolve`, optionally `assertPublishedChangesCovered`.
  - `check-catalog`: `assertSharedDependenciesCatalogued`.
  - `check`: `pnpm exec turbo run build publint attw`.
  - `release`: `assertPublicSet`, `assertPublicDepsPublic`, `assertVersioned`, turbo build/publint/attw, `changeset publish`.
  - `snapshot` (positional `tag`, default `beta`): `assertValidTag`, `assertPublicSet`, `assertPublicDepsPublic`, `changeset version --snapshot <tag>`, turbo, `changeset publish --tag <tag>`.
  - `sync` (`--dry-run`, `--json`): plans from `registryRecord` states and applies publish/trust/tag actions.
  - `swift-mirror` (`--dry-run`): constants `MIRROR_REPOSITORY` = `'conciv-dev/conciv-swift'`, `MIRROR_TREE` = `'native/swift'`, `BRIDGE_MANIFEST` = `'packages/extensions/ios/package.json'`.
- `PUBLIC_PACKAGES` (`guards.ts`): the 41 public `@conciv/*` package names.
- Guards (`guards.ts`): `assertWorkspaceRoot`, `assertValidTag`, `assertValidPackageName`, `assertVersioned`, `assertBootstrappable`, `assertChangesetsResolve`, `assertPublishedChangesCovered`, `assertPublicSet`, `assertPublicDepsPublic`, `assertSharedDependenciesCatalogued`.
- `qualifiesForCoverage(path, filesAllowlist)` (`coverage-files.ts`).
- `parseManifest(raw, path)`, `Manifest` (`manifest.ts`).
- `registryRecord(name)`, `recordFromDocument(value)`, `RegistryState` (`'missing' | 'trusted' | 'untrusted'`), `RegistryRecord` (`registry.ts`).
- `buildSyncPlan(cwd, states)`, `pushMissingTags(cwd, names)`, `SyncPackageState`, `SyncAction` (`'publish' | 'trust' | 'tag'`), `SyncPlanEntry` (`sync.ts`).
- `readWorkspacePackages(cwd)`, `buildDependencyGraph(packages)`, `transitiveDependents(graph, target)`, `WorkspacePackage` (`workspace.ts`).
- `assertBareSemver`, `readBridgeVersion`, `resolveVersionCommit`, `extractCommitSubtree`, `assembleMirrorTree`, `fingerprintTree`, `treesMatch`, `MirrorLayout`, `MirrorTree` (`swift-mirror.ts`).

## Invariants

- `atRoot()` uses `process.cwd()`; `assertWorkspaceRoot` throws `conciv-publish must run at the workspace root ...` unless cwd contains `pnpm-workspace.yaml` and `.changeset` (`cli.ts`, `guards.ts`).
- Dist-tags match `/^[a-z][a-z0-9-]*$/` (`assertValidTag`); package names match `/^@conciv\/[a-z][a-z0-9-]*$/` (`assertValidPackageName`).
- Non-private packages must not be at `0.0.0` at release (`assertVersioned`). `assertBootstrappable` requires a package in `PUBLIC_PACKAGES`, present in the workspace, not private, not `0.0.0`.
- Every changeset `.md` (except `README.md`) names at least one release, every named package exists, and the file is not a symlink (`assertChangesetsResolve`, `parseChangesetPackageNames`, `assertNotSymlink`).
- `--require-coverage` requires `--base`. Changed code in a published package, or in a workspace package with published transitive dependents, needs an added changeset naming a published package (`assertPublishedChangesCovered`).
- Coverage ignores `test/`, `tests/`, `*.test.*` and `*.spec.*`; files in the package's `files` allowlist always count; otherwise only extensionless files or `CODE_FILE_EXTENSIONS` count (`coverage-files.ts`).
- The set of non-private `@conciv/*` packages must equal `PUBLIC_PACKAGES` (`assertPublicSet`), and public packages must not depend on private workspace packages in dependencies, optionalDependencies or peerDependencies (`assertPublicDepsPublic`).
- An external dependency used by two or more manifests (root included) must use `catalog:`, except `CATALOG_EXEMPTIONS` (`packages/extensions/whiteboard`: `drizzle-kit`, `drizzle-orm`) (`guards.ts`).
- `pnpm-workspace.yaml` must be a mapping with a string-array `packages` (`readWorkspaceGlobs`); each package.json must pass `manifestSchema` (`manifest.ts`).
- Registry: `trusted` means `latest` has `_npmUser.trustedPublisher`; 404 means `missing`; other non-OK statuses throw (`registry.ts`).
- Sync plan: `publish` iff missing, `trust` iff not trusted, `tag` iff the local version exists on npm (or the package is missing) and git tag `name@version` does not exist (`sync.ts`).
- The Swift version must be bare semver (`BARE_SEMVER`); the release commit is found with `git log -S` and needs full history (`swift-mirror.ts`). `swift-mirror` requires `GH_MIRROR_TOKEN`, and an existing tag must match the assembled tree (`withMirrorAuth`, `assertTaggedTreeMatches`, `cli.ts`).

## Side Effects

- Spawns `pnpm exec changeset ...`, `pnpm exec turbo run ...`, `pnpm install --lockfile-only` with inherited stdio through execa (`cli.ts`).
- Publishes to npm: `changeset publish`, and `pnpm --filter <name> publish --access public --no-git-checks` (`firstPublish`).
- Configures trusted publishing with `npx --yes npm@^11.15.0 trust github <name> --repo conciv-dev/conciv --file release.yml --allow-publish` (`wireTrust`); runs `npm whoami` (`applySyncPlan`).
- `fetch('https://registry.npmjs.org/<name>')` (`registryRecord`).
- Git: `git diff --name-status --no-renames <base>...HEAD` (`guards.ts`); `git tag -l`, `git tag`, `git push origin refs/tags/...` (`sync.ts`); `pnpm exec changeset git-tag` (`cli.ts`); `git log -S` and `git archive | tar -x` (`swift-mirror.ts`).
- Creates and removes temp dirs `conciv-askpass-*`, `conciv-swift-src-*`, `conciv-swift-*`, `conciv-swift-tag-*`; writes a `0o700` `askpass.sh` that prints `$GH_MIRROR_TOKEN` (`cli.ts`).
- `assembleMirrorTree` deletes then copies `Package.swift`, `Sources`, `Tests`, `README.md`, `RELEASE_HYGIENE.md`, `LICENSE` into the destination (`swift-mirror.ts`).
- Pushes to `https://x-access-token@github.com/conciv-dev/conciv-swift.git` (`push --force origin main`, `push origin <tag>`) with `GIT_ASKPASS` and `GIT_TERMINAL_PROMPT=0`; commits as `conciv-swift-mirror <noreply@conciv.dev>` (`cli.ts`).
- Reads `pnpm-workspace.yaml`, scans for package.json files (skipping dot dirs and node_modules) (`workspace.ts`), and reads `.changeset/*.md` (`guards.ts`).

## Verification

- Run: `cd packages/publish && pnpm test`
