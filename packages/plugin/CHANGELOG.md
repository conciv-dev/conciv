# @conciv/plugin

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
