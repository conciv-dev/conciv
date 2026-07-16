# @conciv/plugin

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.10
  - @conciv/core@0.0.10
  - @conciv/embed@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/extension-compiler@0.0.10
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- [`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195) Thanks [@omridevk](https://github.com/omridevk)! - The dist widget now boots cleanly in real consumer vite apps: the plugin pre-warms the widget module graph (`server.warmup`) so a cold dep-optimizer sees every widget dependency before its first run instead of re-optimizing mid-flight (504 Outdated Optimize Dep, full reloads); `optimizeDeps.exclude` yields to another plugin's `include` (vite-plugin-solid hosts like solid-start no longer crash with "entry point solid-js cannot be marked as external"); Solid singleton dedupe/exclude ids apply only where resolvable from the app root, fixing vite 7 hosts and React hosts whose optimized deps embed Solid (TanStack devtools).

- [#60](https://github.com/conciv-dev/conciv/pull/60) [`18c9521`](https://github.com/conciv-dev/conciv/commit/18c9521886d3f7ea4054ae0ae638494312dc80b8) Thanks [@omridevk](https://github.com/omridevk)! - The vite plugin serves workspace `@conciv` browser packages from src in dev (resolveId src probe + solid compile); published manifests and tarballs unchanged.

- Updated dependencies [[`c25f76d`](https://github.com/conciv-dev/conciv/commit/c25f76d9cc208c21b15e4444491aa073b680e195)]:
  - @conciv/extension-compiler@0.0.9
  - @conciv/cli@0.0.9
  - @conciv/core@0.0.9
  - @conciv/embed@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail — a resizable, open-by-default timeline of session activity — and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf), [`fce6e80`](https://github.com/conciv-dev/conciv/commit/fce6e80e818460ca950b08ac75bccd94a1a72931)]:
  - @conciv/core@0.0.8
  - @conciv/extension-compiler@0.0.8
  - @conciv/cli@0.0.8
  - @conciv/embed@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [[`bbdfc69`](https://github.com/conciv-dev/conciv/commit/bbdfc6940e7c4a45d4a20fb04e12d8e407154bfb)]:
  - @conciv/core@0.0.7
  - @conciv/widget@0.0.7
  - @conciv/cli@0.0.7
  - @conciv/extension@0.0.7
  - @conciv/protocol@0.0.7

## 0.0.6

### Patch Changes

- [#12](https://github.com/conciv-dev/conciv/pull/12) [`6a30c91`](https://github.com/conciv-dev/conciv/commit/6a30c91c76a4ff1df456a14eca0f9d4a78744a57) Thanks [@omridevk](https://github.com/omridevk)! - Fix a crash on Next.js with the webpack bundler introduced by the Turbopack env fix. `withConciv` set the engine port via `process.env.NEXT_PUBLIC_CONCIV_PORT ??= ...`. Bundlers statically replace literal `process.env.NEXT_PUBLIC_*` member expressions with their values at build time — including in the instrumentation chunk — so webpack turned the assignment target into a string literal (`"41700" ??= ...`), a `SyntaxError: Invalid left-hand side in assignment` that crashed the instrumentation hook and took down the dev server (every route 404'd / connection refused). Turbopack didn't apply the replacement in that context, so it only surfaced under `next dev --webpack`. Assign through a computed key (`process.env[key] = ...`) instead, which bundlers don't inline. Verified: the widget now mounts on the real homepage under both Turbopack and webpack.

- Updated dependencies []:
  - @conciv/cli@0.0.6
  - @conciv/core@0.0.6
  - @conciv/extension@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/widget@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- [#10](https://github.com/conciv-dev/conciv/pull/10) [`d9e01e2`](https://github.com/conciv-dev/conciv/commit/d9e01e2d1b6bc5cc959274a7104cc66cd02c23fe) Thanks [@omridevk](https://github.com/omridevk)! - Mount the dev-agent widget on Next.js with Turbopack (the default bundler in Next 16). `withConciv` shipped the engine port to the client (`NEXT_PUBLIC_CONCIV_PORT`) and the server (`CONCIV_OPTIONS`) exclusively through the `next.config` `env` key. Turbopack does not apply that key to the instrumentation bundles, so the client's `process.env.NEXT_PUBLIC_CONCIV_PORT` stayed an un-inlined runtime lookup (undefined → the widget's mount guard never fired) and `register` never received `CONCIV_OPTIONS` (so the engine bound a random port instead of the configured one). `withConciv` now also sets these on `process.env` at config-evaluation time — which runs in Node before Turbopack compiles — so Turbopack inlines the `NEXT_PUBLIC_` value and `register` reads the options at runtime. Uses `??=`, so an explicit environment override still wins. The `env` key is kept for webpack. Zero config.

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/cli@0.0.5
  - @conciv/core@0.0.5
  - @conciv/extension@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/widget@0.0.5

## 0.0.4

### Patch Changes

- [#8](https://github.com/conciv-dev/conciv/pull/8) [`9480816`](https://github.com/conciv-dev/conciv/commit/948081665656ee4fc149701c3206a17402b47299) Thanks [@omridevk](https://github.com/omridevk)! - Force-optimize the widget's CommonJS dependencies so the widget mounts on Vite 8 dev servers. The Vite plugin excludes `@conciv/widget`/`@conciv/extension` from `optimizeDeps` (to keep a single shared `solid-js` runtime between the widget and dynamically-compiled extensions), which also stops Vite's scanner from crawling their transitive deps. As a result the widget's CJS leaves — `partial-json` (via `@tanstack/ai`) and `js-beautify` (via `@conciv/ui-kit-chat-tools`) — were served raw, and cjs-module-lexer failed to detect their named/default exports (`partial-json` initializes exports with a chained `exports.a = … = exports.parse = void 0` the lexer can't read). The extensions module threw at import time and the widget never mounted, despite `/@conciv/extensions.js` serving and the engine booting. The plugin now adds those CJS leaves to `optimizeDeps.include` (gated on `@conciv/widget` being installed), so esbuild pre-bundles them with correct interop. This is Vite-dev-specific; webpack/rspack/esbuild/rollup bundle CJS natively and are unaffected. Zero config.

- Updated dependencies []:
  - @conciv/cli@0.0.4
  - @conciv/core@0.0.4
  - @conciv/extension@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/widget@0.0.4

## 0.0.3

### Patch Changes

- [#5](https://github.com/conciv-dev/conciv/pull/5) [`2d67cc9`](https://github.com/conciv-dev/conciv/commit/2d67cc9785da2274f503c77c839777cc30147e34) Thanks [@omridevk](https://github.com/omridevk)! - Mount the dev-agent widget on SSR stacks (TanStack Start, with or without the nitro server layer) via the Vite module graph. Previously the widget was delivered by editing the served HTML (`transformIndexHtml` + a response-buffering middleware), which SSR hosts bypass — the engine booted and `/@conciv/extensions.js` served, but the widget never mounted. It now imports the extensions module from the framework's client entry and carries the engine origin in that module (`window.__CONCIV_API_BASE__`), so it works regardless of who renders the document. Zero config.

- Updated dependencies []:
  - @conciv/cli@0.0.3
  - @conciv/core@0.0.3
  - @conciv/extension@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/widget@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.2
  - @conciv/core@0.0.2
  - @conciv/extension@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/widget@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/cli@0.0.1
  - @conciv/core@0.0.1
  - @conciv/extension@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/widget@0.0.1
