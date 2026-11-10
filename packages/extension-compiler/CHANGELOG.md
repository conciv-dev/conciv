# @conciv/extension-compiler

## 0.0.22

### Patch Changes

- [#731](https://github.com/conciv-dev/conciv/pull/731) [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c) Thanks [@omridevk](https://github.com/omridevk)! - A page that runs conciv in the Vite DevTools dock no longer gets a second widget when one of its modules is a framework client entry: the page module stays out when the page carries the dock module's script, even when the host html has its own `conciv-widget` meta. A `conciv-widget` meta that holds `null` or another non-object value no longer stops the page widget from mounting.

- [#727](https://github.com/conciv-dev/conciv/pull/727) [`69e9307`](https://github.com/conciv-dev/conciv/commit/69e9307a76b191720e8abd5d163a3f3cfc8d69b8) Thanks [@omridevk](https://github.com/omridevk)! - Show the page launcher on server-rendered Vite hosts (TanStack Start and others whose html skips `transformIndexHtml`) when Vite DevTools is installed. The dock module and dock settings now travel only with `transformIndexHtml`, the same pipeline Vite DevTools uses to inject its dock, so a page that never gets the dock keeps the floating launcher.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/protocol@0.0.22
  - @conciv/extension@0.0.22

## 0.0.21

### Patch Changes

- [#656](https://github.com/conciv-dev/conciv/pull/656) [`0fdd3ef`](https://github.com/conciv-dev/conciv/commit/0fdd3ef2374de79178daa70d5987bc43673684ce) Thanks [@omridevk](https://github.com/omridevk)! - The plugin no longer rewrites `@conciv/*` dist imports to workspace source: hosts always get dist. The `CONCIV_E2E` switch is gone.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937)]:
  - @conciv/protocol@0.0.21
  - @conciv/extension@0.0.21

## 0.0.20

### Patch Changes

- [#539](https://github.com/conciv-dev/conciv/pull/539) [`04a35ca`](https://github.com/conciv-dev/conciv/commit/04a35cafed78ae6f03b509d4d8d74d545c574923) Thanks [@omridevk](https://github.com/omridevk)! - The vite dev hot-serve remaps a workspace `dist` entry to its `src` sibling and Solid-compiles the TSX it finds there. That remap used to key off a `react/` folder-name convention, which turned `@conciv/mascot/react` into Solid output inside a React host and crashed server rendering with `Comp is not a function`. The decision is now derived from the found source file's nearest `tsconfig.json` (following its `extends` chain): a subtree whose effective `compilerOptions.jsxImportSource` is set to something other than `solid-js`, or whose `compilerOptions.jsx` is `react-jsx`/`react-jsxdev` without a `solid-js` `jsxImportSource`, is classified non-Solid and stays on `dist`. Everything else — an explicit `jsxImportSource: "solid-js"`, or no JSX config in the chain at all (pure-TS subtrees) — keeps the existing remap-to-`src` behavior.

  `@conciv/mascot`'s React wrapper subtree carried its JSX config in a sibling file (`tsconfig.react.json` at the package root) rather than in a tsconfig local to `src/react/`, which the nearest-tsconfig directory walk can't discover. It has been relocated to `src/react/tsconfig.json` so the declaration lives with the code it governs; `tsdown.react.config.ts` and the package's `typecheck` script now point at the new path.

- [#554](https://github.com/conciv-dev/conciv/pull/554) [`cef1f05`](https://github.com/conciv-dev/conciv/commit/cef1f0553911fcf02e3db8660b48d540062966ad) Thanks [@omridevk](https://github.com/omridevk)! - Dev hosts running behind an AI agent (`CLAUDECODE`, `AI_AGENT`, etc.) no longer hit an unbounded browser console echo loop. Vite 8 auto-enables `server.forwardConsole` when it detects an agent env, and `@tanstack/devtools-vite`'s console pipe re-injects forwarded server logs into the page as `[Server] ...` entries; a page-side `console.error` (e.g. the widget's virtualizer `ResizeObserver` warning) could round-trip forever, growing on every hop. `concivSolidConfig` now explicitly sets `server.forwardConsole: false`, so every host wired through the conciv vite plugin is immune regardless of environment variables.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3)]:
  - @conciv/extension@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/extension@0.0.19

## 0.0.18

### Patch Changes

- [#261](https://github.com/conciv-dev/conciv/pull/261) [`05142ed`](https://github.com/conciv-dev/conciv/commit/05142ed5d738309686e35d9231139229b07bd408) Thanks [@omridevk](https://github.com/omridevk)! - The client/server split now follows the declaration that owns a handler instead of the method name
  that terminates it. A module that declares a capability without declaring an extension is now
  processed (the marker matches `defineExtension`, `defineTool` and `defineAttachment`), which closes a
  leak that ran both ways: such a module used to ship its `.server()` handler, with its `node:*`
  imports and system prompt, into the browser bundle, and its browser handler into the server bundle.
  A `render`, `client`, `server` or `card` call is only collapsed when its receiver traces back,
  through constant bindings only, to a `define*` call imported from `@conciv/extension`, so ordinary
  code that happens to use those names survives both builds, and so does another library's builder
  that happens to share a name with ours; `card`
  joins the node strip set, so an attachment's card component no longer reaches the server. On the
  server, the splitter runs as a jiti `transform` hook across the whole import graph, so a capability
  declared in an imported module is split like one declared in the entry file. The one case per-module
  receiver analysis cannot resolve is a terminator called on a binding imported from another module
  (as in the recorder extension, which already pre-splits through its `./client` and `./server`
  package exports); that is left untouched.
- Updated dependencies [[`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2)]:
  - @conciv/extension@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - First-party extensions are folder-installable: `pnpm add @conciv/extension-<name>`, drop a one-line re-export in `conciv/extensions/<name>.tsx`, and both halves load on every supported framework.

  Every published extension (tanstack, terminal, test-runner, whiteboard, recorder) ships per-environment conditional exports: the `browser` condition resolves `dist/client.js`, the `import` condition resolves `dist/server.js`, with per-condition `types`, plus an explicit `./server` subpath. `@conciv/extension-compiler` gains the shared discovery primitives (`@conciv/extension-compiler/dedupe`: provenance-carrying `dedupeExtensions`, `toSortedEntries`, `isExtension`) used by both the server loader and every client path; `loadServerExtensions` now matches files exactly (no directories, no `.d.ts`), treats a missing default export as fatal, and reports every dropped entry with its source and reason. `listExtensionFiles` is the single fs listing primitive.

  Next.js support (Turbopack and `next dev --webpack`, current GA line): `withConciv` generates an app-local `.conciv/extensions-client.gen.tsx` entry (knitwork static imports, idempotent) and wires it to the widget via `turbopack.resolveAlias`/webpack alias as `@conciv/app-extensions`; `register()` runs a chokidar watcher that regenerates the entry live on add/remove. The widget stays lazy (dynamic imports behind the dev-only guard), the engine register entrypoints are stubbed out of Next edge-runtime compilations, and the generated client module now threads a resolved dedupe entry so dist-mode consumers boot. The tanstack extension renders a mount-time composer chip as its client-active surface and degrades gracefully in apps without a TanStack router.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3)]:
  - @conciv/extension@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.10

## 0.0.9

### Patch Changes

- [`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195) Thanks [@omridevk](https://github.com/omridevk)! - The dist widget now boots cleanly in real consumer vite apps: the plugin pre-warms the widget module graph (`server.warmup`) so a cold dep-optimizer sees every widget dependency before its first run instead of re-optimizing mid-flight (504 Outdated Optimize Dep, full reloads); `optimizeDeps.exclude` yields to another plugin's `include` (vite-plugin-solid hosts like solid-start no longer crash with "entry point solid-js cannot be marked as external"); Solid singleton dedupe/exclude ids apply only where resolvable from the app root, fixing vite 7 hosts and React hosts whose optimized deps embed Solid (TanStack devtools).

- Updated dependencies []:
  - @conciv/extension@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies []:
  - @conciv/extension@0.0.8
