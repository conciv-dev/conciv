# publish/src

## Overview

The `conciv-publish` citty command tree. It runs release guards (workspace root, changesets, public package set, catalog usage, changeset coverage), versions and publishes through changesets and turbo, reconciles npm with `PUBLIC_PACKAGES` (first publish, trusted publishing, git tags), and mirrors `native/swift` into the `conciv-dev/conciv-swift` repository.

## Interface

- `main` command `conciv-publish` (`cli.ts`), run through `runMain(main)`, with subcommands:
  - `version`: `assertChangesetsResolve`, `pnpm exec changeset version`, `pnpm install --lockfile-only`.
  - `check-changesets` (`--require-coverage`, `--base <ref>`): `assertChangesetsResolve`, optionally `assertPublishedChangesCovered`.
  - `check-catalog`: `assertSharedDependenciesCatalogued`.
  - `check-typecheck-coverage`: `assertTypecheckCoversTrackedFiles`.
  - `check-test-budget`: `assertTestsWithinBudget`, then prints its notes.
  - `check-turbo-depends-on`: `assertTypeTasksDependOnDistReads`: each package's `typecheck`, in the order `turbo run typecheck --dry=json` gives, comes after `<name>#build` of every workspace package with a `build` script whose dist its program reads. A read counts whether the import comes from the package's own source or from another package's built d.ts it reads: a consumer that reads a dist only through another dist still waits for it, or its typecheck races that dist's build and sees the import as untyped `any`.
  - `check-dependency-loops`: `assertNoDependencyLoop`. Workspace packages never form a loop through `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies`: turbo's `^build` follows all four (`dependencies_with_kind` in turbo 2.11.10's `package_json.rs`), so a loop through any of them is a task-graph cycle.
  - `check-plugin-ui-kit`: `assertPluginsDrawThroughContextUi`.
  - `check`: `pnpm exec turbo run build publint attw`.
  - `release`: `assertPublicSet`, `assertPublicDepsPublic`, `assertVersioned`, turbo build/publint/attw, `changeset publish`.
  - `snapshot` (positional `tag`, default `beta`): `assertValidTag`, `assertPublicSet`, `assertPublicDepsPublic`, `changeset version --snapshot <tag>`, turbo, `changeset publish --tag <tag>`.
  - `sync` (`--dry-run`, `--json`): plans from `registryRecord` states and applies publish/trust/tag actions.
  - `swift-mirror` (`--dry-run`): constants `MIRROR_REPOSITORY` = `'conciv-dev/conciv-swift'`, `MIRROR_TREE` = `'native/swift'`, `BRIDGE_MANIFEST` = `'packages/plugins/ios/package.json'`.
- `PUBLIC_PACKAGES` (`guards.ts`): the 42 public `@conciv/*` package names.
- Guards (`guards.ts`): `assertWorkspaceRoot`, `assertValidTag`, `assertVersioned`, `assertBootstrappable`, `assertChangesetsResolve`, `assertPublishedChangesCovered`, `assertPublicSet`, `assertPublicDepsPublic`, `assertNoDependencyLoop`, `assertSharedDependenciesCatalogued`.
- `qualifiesForCoverage(path, filesAllowlist)` (`guards.ts`).
- `assertTypecheckCoversTrackedFiles(cwd)` (`typecheck-coverage.ts`).
- `assertTestsWithinBudget(cwd)`, `countTestCasesByPackage(cwd)`, `countTestCases(filename, source)` (`test-budget.ts`).
- `assertTypeTasksDependOnDistReads(cwd)`, `assertPluginsDrawThroughContextUi(cwd)` (`workspace-imports.ts`).
- `parseManifest(raw, path)`, `Manifest` (`workspace.ts`).
- `registryRecord(name)`, `recordFromDocument(value)`, `RegistryState` (`'missing' | 'trusted' | 'untrusted'`), `RegistryRecord` (`sync.ts`).
- `buildSyncPlan(cwd, states)`, `pushMissingTags(cwd, names)`, `SyncPackageState`, `SyncAction` (`'publish' | 'trust' | 'tag'`), `SyncPlanEntry` (`sync.ts`).
- `readWorkspacePackages(cwd)`, `findOwner(packages, path)`, `buildDependencyGraph(packages, fields = ['dependencies', 'devDependencies'])`, `transitiveDependents(graph, target)`, `WorkspacePackage` (`workspace.ts`).
- `assertBareSemver`, `readBridgeVersion`, `resolveVersionCommit`, `extractCommitSubtree`, `assembleMirrorTree`, `fingerprintTree`, `treesMatch`, `MirrorLayout`, `MirrorTree` (`swift-mirror.ts`).

## Invariants

- `atRoot()` uses `process.cwd()`; `assertWorkspaceRoot` throws `conciv-publish must run at the workspace root ...` unless cwd contains `pnpm-workspace.yaml` and `.changeset` (`cli.ts`, `guards.ts`).
- Dist-tags match `/^[a-z][a-z0-9-]*$/` (`assertValidTag`); package names match `/^@conciv\/[a-z][a-z0-9-]*$/` (`assertValidPackageName`).
- Non-private packages must not be at `0.0.0` at release (`assertVersioned`). `assertBootstrappable` requires a package in `PUBLIC_PACKAGES`, present in the workspace, not private, not `0.0.0`.
- Every changeset `.md` (except `README.md`) names at least one release, every named package exists, and the file is not a symlink (`assertChangesetsResolve`, `parseChangesetPackageNames`, `assertNotSymlink`).
- `--require-coverage` requires `--base`. Changed code in a published package, or in a workspace package with published transitive dependents, needs an added changeset naming a published package (`assertPublishedChangesCovered`).
- Coverage ignores `test/`, `*.test.*` and `*.spec.*`; files in the package's `files` allowlist always count; otherwise only extensionless files or `CODE_FILE_EXTENSIONS` count (`guards.ts`).
- The set of non-private `@conciv/*` packages must equal `PUBLIC_PACKAGES` (`assertPublicSet`); every `@internal/*` package (`@internal/opaque`, `@internal/plugin`) must stay private (source-only, conciv's own builds inline them) and `assertPublicSet` names one when it is not; public packages must not depend on private workspace packages in dependencies, optionalDependencies or peerDependencies (`assertPublicDepsPublic`); and after the build no public package's `dist` d.ts imports a private workspace package (`assertPublicTypesPublic`, run by `check`, `release` and `snapshot`).
- An external dependency used by two or more manifests (root included) must use `catalog:` (`guards.ts`).
- Every workspace package with tracked TypeScript files either has a plain-JSON `tsconfig.json` that extends `@conciv/tsconfig/*` or is named in `OFF_PRESET_PACKAGES` (`typecheck-coverage.ts`: today's framework-owned e2e and example apps and `native/swift`); a listed package that moves onto the preset is reported so the list shrinks. A listed package still has its `test/` files and `playwright.config.ts` (the repo's own files inside a framework scaffold) in the program of a tsconfig its `typecheck` script runs; the e2e apps do it with `tsconfig.e2e.json`. A preset package sets no `include`, `exclude` or `files` in `tsconfig.json`, `tsconfig.build.json` or any tsconfig its `typecheck` script runs (the preset owns them), and every git-tracked `.ts`/`.tsx`/`.mts`/`.cts` file it owns is in the program of a tsconfig that script runs with `tsc -p <tsconfig>` (bare `tsc` means `tsconfig.json`), read from `tsc --listFilesOnly`; `--showConfig` would drop the files an inherited `${configDir}` include matches under TypeScript 6. TypeScript 7 ships no `readConfigFile`, so preset tsconfigs are read with `JSON.parse`.
- `check-test-budget` counts the test cases of every git-tracked `*.test.*`/`*.spec.*` JS or TS file outside a `fixtures/` folder, per owning workspace package, with `oxc-parser`, so a comment or a string never counts. A case is a call of `test`, `it` or a name bound to `test.extend(...)`/`it.extend(...)`, through `concurrent`, `sequential`, `skip`, `only`, `todo`, `fails`, `fail`, `fixme`, `each`, `for`, `skipIf` and `runIf`, plus `@effect/vitest`'s `effect` and `live` runners on those names (`it.effect`, `it.live.skip`, ...; a `layer(...)` block is not a case); a curried form (`test.each(table)(...)`) counts once, and `describe`, `use`, `step` and hooks never count. A package over its `test-budget.json` number (0 when absent) fails, naming the package, its count and its budget; one under it prints a note to lower the number (`test-budget.ts`). RuleTester cases (`packages/oxlint-plugin`) are entries of `tester.run`, not calls, so they are not counted.
- A plugin package under `packages/plugins/` (a served plugin) draws through `ctx.ui` (conciv's own plugins read conciv's members with `OpaqueUi.toInternal`): no build source (the same file set as above) imports a `@conciv/ui-kit*` package, and its `package.json` names none in any dependency field, `devDependencies` included (`workspace-imports.ts`). The built-ins in `@internal/builtin-plugins` sit outside `packages/plugins/` and import the kits directly, like opencode's gui plugins.
- `pnpm-workspace.yaml` must be a mapping with a string-array `packages` (`readWorkspaceGlobs`); each package.json must pass `manifestSchema` (`workspace.ts`).
- Registry: `trusted` means `latest` has `_npmUser.trustedPublisher`; 404 means `missing`; other non-OK statuses throw (`sync.ts`).
- Sync plan: `publish` iff missing, `trust` iff not trusted, `tag` iff the local version exists on npm (or the package is missing) and git tag `name@version` does not exist (`sync.ts`).
- The Swift version must be bare semver (`BARE_SEMVER`); the release commit is found with `git log -S` and needs full history (`swift-mirror.ts`). `swift-mirror` requires `GH_MIRROR_TOKEN`, and an existing tag must match the assembled tree (`withMirrorAuth`, `assertTaggedTreeMatches`, `cli.ts`).

## Side Effects

- Spawns `pnpm exec changeset ...`, `pnpm exec turbo run ...`, `pnpm install --lockfile-only` with inherited stdio through execa (`cli.ts`).
- Publishes to npm: `changeset publish`, and `pnpm --filter <name> publish --access public --no-git-checks` (`firstPublish`).
- Configures trusted publishing with `npx --yes npm@^11.15.0 trust github <name> --repo conciv-dev/conciv --file release.yml --allow-publish` (`wireTrust`); runs `npm whoami` (`applySyncPlan`).
- `fetch('https://registry.npmjs.org/<name>')` (`registryRecord`).
- Git: `git diff --name-status --no-renames <base>...HEAD` (`guards.ts`); `git ls-files` and `tsc -p <tsconfig> --listFilesOnly` per package (`typecheck-coverage.ts`); `git ls-files` per package with an explicit build list and per plugin package (`workspace-imports.ts`); `git ls-files` (`test-budget.ts`); `git tag -l`, `git tag`, `git push origin refs/tags/...` (`sync.ts`); `pnpm exec changeset git-tag` (`cli.ts`); `git log -S` and `git archive | tar -x` (`swift-mirror.ts`).
- Creates and removes temp dirs `conciv-askpass-*`, `conciv-swift-src-*`, `conciv-swift-*`, `conciv-swift-tag-*`; writes a `0o700` `askpass.sh` that prints `$GH_MIRROR_TOKEN` (`cli.ts`).
- `assembleMirrorTree` deletes then copies `Package.swift`, `Sources`, `Tests`, `README.md`, `RELEASE_HYGIENE.md`, `LICENSE` into the destination (`swift-mirror.ts`).
- Pushes to `https://x-access-token@github.com/conciv-dev/conciv-swift.git` (`push --force origin main`, `push origin <tag>`) with `GIT_ASKPASS` and `GIT_TERMINAL_PROMPT=0`; commits as `conciv-swift-mirror <noreply@conciv.dev>` (`cli.ts`).
- Reads `pnpm-workspace.yaml`, scans for package.json files (skipping dot dirs and node_modules) (`workspace.ts`), and reads `.changeset/*.md` (`guards.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/publish` from the repo root (turbo builds the package and its dependencies first)
