# @conciv/extension-terminal

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/ui-kit-terminal@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- [#112](https://github.com/conciv-dev/conciv/pull/112) [`7b075ac`](https://github.com/conciv-dev/conciv/commit/7b075aca0d634fbfa9893f34a1366c2a1af9e20d) Thanks [@omridevk](https://github.com/omridevk)! - Replace `node-pty` with `@lydell/node-pty`, which ships prebuilt binaries as platform-scoped optional dependencies and has no install scripts. Installing `@conciv/it` under pnpm >= 10 no longer fails with `ERR_PNPM_IGNORED_BUILDS` or requires build-script approval ([#109](https://github.com/conciv-dev/conciv/issues/109)).

- Updated dependencies []:
  - @conciv/extension@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/ui-kit-chat@0.0.15
  - @conciv/ui-kit-chat-tools@0.0.15
  - @conciv/ui-kit-system@0.0.15
  - @conciv/ui-kit-terminal@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3), [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41), [`d2c4867`](https://github.com/conciv-dev/conciv/commit/d2c48671ddf47815e6453c1f5997a07e0b7cbae7)]:
  - @conciv/extension@0.0.14
  - @conciv/ui-kit-chat@0.0.14
  - @conciv/ui-kit-terminal@0.0.14
  - @conciv/ui-kit-chat-tools@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/ui-kit-chat-tools@0.0.13
  - @conciv/ui-kit-terminal@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/ui-kit-chat@0.0.12
  - @conciv/ui-kit-chat-tools@0.0.12
  - @conciv/ui-kit-system@0.0.12
  - @conciv/ui-kit-terminal@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/ui-kit-chat@0.0.11
  - @conciv/ui-kit-chat-tools@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11
  - @conciv/ui-kit-terminal@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/ui-kit-chat@0.0.10
  - @conciv/ui-kit-chat-tools@0.0.10
  - @conciv/ui-kit-system@0.0.10
  - @conciv/ui-kit-terminal@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-chat-tools@0.0.9
  - @conciv/ui-kit-system@0.0.9
  - @conciv/ui-kit-terminal@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/ui-kit-terminal@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/ui-kit-chat-tools@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/api-client@0.0.7
  - @conciv/extension@0.0.7
  - @conciv/protocol@0.0.7
  - @conciv/ui-kit-chat@0.0.7
  - @conciv/ui-kit-chat-tools@0.0.7
  - @conciv/ui-kit-system@0.0.7
  - @conciv/ui-kit-terminal@0.0.7
