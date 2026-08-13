# @conciv/extension-tanstack

## 0.0.19

### Patch Changes

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/ui-kit-chat-tools@0.0.19
  - @conciv/page@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`3077460`](https://github.com/conciv-dev/conciv/commit/307746013f8dbdc03e1cd98673aaa4e574b81342)]:
  - @conciv/ui-kit-chat@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/page@0.0.18
  - @conciv/ui-kit-chat-tools@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies [[`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85), [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a)]:
  - @conciv/ui-kit-chat@0.0.17
  - @conciv/ui-kit-chat-tools@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/page@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Add the TanStack Router/Start inspection adapter: agent tools for router state, route tree, loader data, query cache, navigation/invalidation, dev-server build errors, route manifest, and server-function traces, each with a render card, all reading through a FrameworkAdapter contract object.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/page@0.0.16
  - @conciv/ui-kit-system@0.0.16
