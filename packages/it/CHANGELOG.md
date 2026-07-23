# @conciv/it

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b)]:
  - @conciv/extension-terminal@0.0.16
  - @conciv/extension-test-runner@0.0.16
  - @conciv/extension-whiteboard@0.0.16
  - @conciv/extension-compiler@0.0.16
  - @conciv/plugin@0.0.16
  - @conciv/embed@0.0.16

## 0.0.15

### Patch Changes

- [`5eaa498`](https://github.com/conciv-dev/conciv/commit/5eaa4984cc5e8f4c673bb6d2c9e70b2b40c1c1b2) Thanks [@omridevk](https://github.com/omridevk)! - Fix widget flicker on open, restore FAB hover, and drop the recorder from the builtin extensions.

  The panel subtree was destroyed on close, so every open remounted the chat pane, opened a fresh session and SSE subscription, and rendered blank for ~100ms before replaying every message row's entrance at once. The panel now mounts on first open and stays mounted; closing only toggles its visibility classes.

  Entrance shortcuts (`anim-fab`, `anim-pop`, `anim-presence-in`) carried `animation-fill-mode: both`. Since the keyframes end at the element's natural state, the forwards fill only served to pin `transform` after the animation finished, which outranked the FAB's hover lift and press states. `anim-rise`/`anim-rise-d` keep a fill as `backwards`, which is what their `animation-delay` actually needs.

  `@conciv/extension-recorder` is no longer registered as a builtin: it started rrweb capture on every page load whether or not a recording was wanted, and the resulting flush traffic degraded widget responsiveness ([#114](https://github.com/conciv-dev/conciv/issues/114)). The package is still published and can be enabled explicitly.

- Updated dependencies [[`7b075ac`](https://github.com/conciv-dev/conciv/commit/7b075aca0d634fbfa9893f34a1366c2a1af9e20d)]:
  - @conciv/extension-terminal@0.0.15
  - @conciv/embed@0.0.15
  - @conciv/extension-test-runner@0.0.15
  - @conciv/extension-whiteboard@0.0.15
  - @conciv/plugin@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`32deb1c`](https://github.com/conciv-dev/conciv/commit/32deb1c4e25e5a8a8fb8ac1d0b089347433cc483)]:
  - @conciv/extension-recorder@0.0.14
  - @conciv/embed@0.0.14
  - @conciv/extension-terminal@0.0.14
  - @conciv/extension-test-runner@0.0.14
  - @conciv/extension-whiteboard@0.0.14
  - @conciv/plugin@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`5db2ac5`](https://github.com/conciv-dev/conciv/commit/5db2ac5a8e7d49f2966cbbaf6718483f5837f759)]:
  - @conciv/embed@0.0.13
  - @conciv/extension-terminal@0.0.13
  - @conciv/extension-test-runner@0.0.13
  - @conciv/extension-whiteboard@0.0.13
  - @conciv/plugin@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.12
  - @conciv/plugin@0.0.12
  - @conciv/embed@0.0.12
  - @conciv/extension-terminal@0.0.12
  - @conciv/extension-whiteboard@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.11
  - @conciv/plugin@0.0.11
  - @conciv/extension-terminal@0.0.11
  - @conciv/extension-test-runner@0.0.11
  - @conciv/extension-whiteboard@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/embed@0.0.10
  - @conciv/extension-terminal@0.0.10
  - @conciv/extension-test-runner@0.0.10
  - @conciv/extension-whiteboard@0.0.10
  - @conciv/plugin@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies [[`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195), [`18c9521`](https://github.com/conciv-dev/conciv/commit/18c9521886d3f7ea4054ae0ae638494312dc80b8)]:
  - @conciv/plugin@0.0.9
  - @conciv/extension-terminal@0.0.9
  - @conciv/extension-whiteboard@0.0.9
  - @conciv/embed@0.0.9
  - @conciv/extension-test-runner@0.0.9

## 0.0.8

### Patch Changes

- [#54](https://github.com/conciv-dev/conciv/pull/54) [`945901b`](https://github.com/conciv-dev/conciv/commit/945901ba8780486412520fbbe478488cc2953fb1) Thanks [@omridevk](https://github.com/omridevk)! - Motion pass across the widget and site (subtler entrances, interruptible open/close, reduced-motion gates, transform-based movement, token cohesion), plus site-embedding fixes: resolve `@conciv/embed` to an absolute path so consumer apps do not declare it, skip widget injection into nested frames, and dedupe the Solid singletons (`solid-js`, `@tanstack/solid-router`, `@ark-ui/solid`) so embedders load a single copy.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf), [`68d1f16`](https://github.com/conciv-dev/conciv/commit/68d1f16d1278c38a18ff35f8d4a7fdadf6086c8e)]:
  - @conciv/plugin@0.0.8
  - @conciv/extension-whiteboard@0.0.8
  - @conciv/embed@0.0.8
  - @conciv/extension-test-runner@0.0.8
  - @conciv/extension-terminal@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.7
  - @conciv/plugin@0.0.7
  - @conciv/extension-whiteboard@0.0.7
  - @conciv/extension-terminal@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies [[`6a30c91`](https://github.com/conciv-dev/conciv/commit/6a30c91c76a4ff1df456a14eca0f9d4a78744a57)]:
  - @conciv/plugin@0.0.6
  - @conciv/extension-whiteboard@0.0.6
  - @conciv/extension-test-runner@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139), [`d9e01e2`](https://github.com/conciv-dev/conciv/commit/d9e01e2d1b6bc5cc959274a7104cc66cd02c23fe)]:
  - @conciv/extension-test-runner@0.0.5
  - @conciv/extension-whiteboard@0.0.5
  - @conciv/plugin@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [[`9480816`](https://github.com/conciv-dev/conciv/commit/948081665656ee4fc149701c3206a17402b47299)]:
  - @conciv/plugin@0.0.4
  - @conciv/extension-whiteboard@0.0.4
  - @conciv/extension-test-runner@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`2d67cc9`](https://github.com/conciv-dev/conciv/commit/2d67cc9785da2274f503c77c839777cc30147e34)]:
  - @conciv/plugin@0.0.3
  - @conciv/extension-whiteboard@0.0.3
  - @conciv/extension-test-runner@0.0.3

## 0.0.2

### Patch Changes

- [`03d554d`](https://github.com/conciv-dev/conciv/commit/03d554d3459c7ca24484fac75bfbc4cad2db0430) Thanks [@omridevk](https://github.com/omridevk)! - Point all package homepages at https://conciv.dev. First release published via GitHub Actions OIDC trusted publishing (with provenance).

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.2
  - @conciv/extension-whiteboard@0.0.2
  - @conciv/plugin@0.0.2

## 0.0.1

### Patch Changes

- Initial public release of conciv: install `@conciv/it` and add the plugin from `@conciv/it/plugin/<bundler>` (vite, webpack, rspack, rollup, esbuild, nextjs).

- Updated dependencies []:
  - @conciv/extension-test-runner@0.0.1
  - @conciv/extension-whiteboard@0.0.1
  - @conciv/plugin@0.0.1
