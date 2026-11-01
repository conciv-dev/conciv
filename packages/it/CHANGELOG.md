# @conciv/it

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.
- Updated dependencies [[`0fdd3ef`](https://github.com/conciv-dev/conciv/commit/0fdd3ef2374de79178daa70d5987bc43673684ce), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f727664`](https://github.com/conciv-dev/conciv/commit/f727664be45006d5bf2acf7234bbbbaa3f647ac7), [`af69127`](https://github.com/conciv-dev/conciv/commit/af69127fb97de0d722e206a6d31471a0569fdf02), [`8d69e53`](https://github.com/conciv-dev/conciv/commit/8d69e53ab3e7c4856db980bb5656eda4fddac9ed), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c202114`](https://github.com/conciv-dev/conciv/commit/c20211415e977a79d08af5f083b9bc28cbb56900), [`15c2fcb`](https://github.com/conciv-dev/conciv/commit/15c2fcb875fae4ffa552671380b7227a1e790d6f), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`4465b85`](https://github.com/conciv-dev/conciv/commit/4465b854e45ce6553eebd6547e2d0be49157f71e), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`c90309e`](https://github.com/conciv-dev/conciv/commit/c90309e4bf79f3576555ec3feb2e6af8a4f563dd), [`62f5429`](https://github.com/conciv-dev/conciv/commit/62f5429329a717535efe3a9ec6c61f00cb2f1a61)]:
  - @conciv/plugin@0.0.21
  - @conciv/extension-compiler@0.0.21
  - @conciv/extension-whiteboard@0.0.21
  - @conciv/embed@0.0.21
  - @conciv/extension-design@0.0.21
  - @conciv/extension-recorder@0.0.21
  - @conciv/extension-ios@0.0.21
  - @conciv/extension-terminal@0.0.21
  - @conciv/extension-test-runner@0.0.21

## 0.0.20

### Patch Changes

- [#613](https://github.com/conciv-dev/conciv/pull/613) [`9e9e683`](https://github.com/conciv-dev/conciv/commit/9e9e683fb48ab3fdd9ae41de86dafff4fb3fa28d) Thanks [@omridevk](https://github.com/omridevk)! - The Next.js entry (`@conciv/it/plugin/nextjs`, `@conciv/plugin/nextjs`) now resolves to a Node-free `register` under the `edge-light` export condition, so the Edge build of `instrumentation.ts` no longer pulls in `node:fs`/`process.cwd` and Next stops printing "not supported in the Edge Runtime" warnings. No import path changes.

- [#517](https://github.com/conciv-dev/conciv/pull/517) [`a3bf205`](https://github.com/conciv-dev/conciv/commit/a3bf205875635f8fdda4d8a9fc5cf5856b019356) Thanks [@omridevk](https://github.com/omridevk)! - Align the `@conciv/it` package description with the "Claude Code, living inside your running app" headline used on the README and site.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`258fe9a`](https://github.com/conciv-dev/conciv/commit/258fe9a39f93eaf2f258f0f87efa9b2e3878fa01), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9e9e683`](https://github.com/conciv-dev/conciv/commit/9e9e683fb48ab3fdd9ae41de86dafff4fb3fa28d), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`6020d52`](https://github.com/conciv-dev/conciv/commit/6020d52d60bc6c824118d10787d557beeac1fc3f), [`f3bea6c`](https://github.com/conciv-dev/conciv/commit/f3bea6c3656a282dc193b86f9835bfa80ba135d7), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`c5015fe`](https://github.com/conciv-dev/conciv/commit/c5015fe3ec89327975fabf814f0d6eaadcada1fb), [`d03af7f`](https://github.com/conciv-dev/conciv/commit/d03af7f7cac4267f9b573f0cadcd69e74c019f89), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`413bc87`](https://github.com/conciv-dev/conciv/commit/413bc87ccfd2cc445f0a5b05e039a92d952c29b9), [`04a35ca`](https://github.com/conciv-dev/conciv/commit/04a35cafed78ae6f03b509d4d8d74d545c574923), [`163cfd5`](https://github.com/conciv-dev/conciv/commit/163cfd5f844a2c8b97a97c8ceb1440076ff69a21), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`78f17c8`](https://github.com/conciv-dev/conciv/commit/78f17c876b6d101170b92afec396f0fcec0ee3f3), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`70614e8`](https://github.com/conciv-dev/conciv/commit/70614e8f2b415145bfb8f9198bd8818307d15478), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`7a95ab8`](https://github.com/conciv-dev/conciv/commit/7a95ab8e0cf959d75fb0b47977325b02d90c4718), [`cef1f05`](https://github.com/conciv-dev/conciv/commit/cef1f0553911fcf02e3db8660b48d540062966ad), [`152a7bd`](https://github.com/conciv-dev/conciv/commit/152a7bdf788399e72e20ddb3c780217940faa632)]:
  - @conciv/extension-recorder@0.0.20
  - @conciv/extension-terminal@0.0.20
  - @conciv/extension-test-runner@0.0.20
  - @conciv/extension-whiteboard@0.0.20
  - @conciv/embed@0.0.20
  - @conciv/plugin@0.0.20
  - @conciv/extension-compiler@0.0.20
  - @conciv/extension-ios@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/plugin@0.0.19
  - @conciv/embed@0.0.19
  - @conciv/extension-recorder@0.0.19
  - @conciv/extension-terminal@0.0.19
  - @conciv/extension-test-runner@0.0.19
  - @conciv/extension-whiteboard@0.0.19
  - @conciv/extension-ios@0.0.19
  - @conciv/extension-compiler@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`830fc5d`](https://github.com/conciv-dev/conciv/commit/830fc5d17b3bf6ce146b413bb7ddb372ad2c821a), [`47c5423`](https://github.com/conciv-dev/conciv/commit/47c5423107f588c9bf5cc94faa5348fc769ef89e), [`05142ed`](https://github.com/conciv-dev/conciv/commit/05142ed5d738309686e35d9231139229b07bd408)]:
  - @conciv/extension-ios@0.0.18
  - @conciv/embed@0.0.18
  - @conciv/extension-compiler@0.0.18
  - @conciv/extension-recorder@0.0.18
  - @conciv/extension-terminal@0.0.18
  - @conciv/extension-test-runner@0.0.18
  - @conciv/plugin@0.0.18
  - @conciv/extension-whiteboard@0.0.18

## 0.0.17

### Patch Changes

- [#151](https://github.com/conciv-dev/conciv/pull/151) [`5396837`](https://github.com/conciv-dev/conciv/commit/53968379fbc6958eb2642d544f6f64791d811243) Thanks [@omridevk](https://github.com/omridevk)! - Restore pairing-file discovery for hosts that install @conciv/it. A dev core again writes
  `~/.conciv/dev-endpoint.json`, so the iOS SDK finds the running dev server instead of falling back to
  probing a fixed list of ports. The temporary-directory location that 0.0.16 forced on every run is
  now a plugin option, `devEndpointDir`, that a host sets when it wants the pairing file elsewhere.
- Updated dependencies [[`0d2ddf6`](https://github.com/conciv-dev/conciv/commit/0d2ddf6cb63baa58095a70faf9783c12a895928c), [`d76c337`](https://github.com/conciv-dev/conciv/commit/d76c337ba404b1f5c23a6f548a92e008f09490dd)]:
  - @conciv/embed@0.0.17
  - @conciv/extension-ios@0.0.17
  - @conciv/extension-terminal@0.0.17
  - @conciv/extension-test-runner@0.0.17
  - @conciv/extension-whiteboard@0.0.17
  - @conciv/plugin@0.0.17
  - @conciv/extension-compiler@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`1019e21`](https://github.com/conciv-dev/conciv/commit/1019e213fc99b84d0931a50cffa2cd602fd31e0e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b)]:
  - @conciv/extension-terminal@0.0.16
  - @conciv/extension-test-runner@0.0.16
  - @conciv/extension-whiteboard@0.0.16
  - @conciv/extension-compiler@0.0.16
  - @conciv/plugin@0.0.16
  - @conciv/extension-ios@0.0.16
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
