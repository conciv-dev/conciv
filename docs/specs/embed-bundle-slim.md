# Slim widget bundles and build outputs

Decided 2026-11-10 with Omri. Goal: a widget build and its turbo cache entry cost MBs, not hundreds of MBs.

## Why

Measured on main (f26263fa9-era):

- `packages/embed/dist` is 155 MB per build:
  - `conciv-widget.global.js` is 23 MB, and `conciv-widget-native.global.js` (22 MB) is almost the same file.
  - Each has a roughly 50 MB `.map` that embeds all 2,467 sources.
- Both IIFE builds set `rollupOptions.output.codeSplitting: false`, so every dynamic import is inlined. The biggest contributors:
  - `@shikijs/langs`: all languages, 8.6 MB;
  - `@shikijs/themes`: 1.5 MB;
  - mermaid, elkjs, cytoscape and `@mermaid-js/parser`: 7.3 MB;
  - katex 0.6 MB;
  - rrweb plus rrweb-player 1.1 MB;
  - xterm 0.3 MB.
- In one day, the main checkout's turbo cache gained 3,923 entries, 5 GB in total:
  - embed: 64 builds, about 31 MB each, 2 GB;
  - extensions: 276 entries, 1.7 GB.
- `e2e/nextjs` outputs `".next/**", "!.next/cache/**"`. Next 16 keeps its dev cache in `.next/dev/cache`, so one entry was 198 MB of turbopack `.sst` files.
- `dist` is published, so npm ships these maps too.

The ESM build (`vite.config.ts`, `mount.js` plus chunks, about 1.5 MB) is already split and externalizes `@conciv/*`, solid and ark. It is not part of this problem.

## Who consumes the IIFE bundles

- `conciv-widget.global.js` (entry `tests/fixtures/global-entry.ts`) is used by:
  - the widget integration tests (`packages/embed/tests/helpers.ts`), which inline the file's text into a page;
  - `packages/embed/tests/unit/embed.test.ts`;
  - `apps/site/scripts/copy-widget-bundle.mjs`, which copies it to `apps/site/public`;
  - `packages/bundle-size/src/measure.ts`.
- `conciv-widget-native.global.js` (entry `src/native-entry.ts`) is used by:
  - `packages/core/src/api/native-page.ts`, which serves the one file `NATIVE_BUNDLE` to the iOS webview page;
  - `packages/core/test/core-api.it.test.ts:1189`;
  - `packages/plugin/test/plugin.it.test.ts:498`.

## Changes

1. **Lazy chunks for the IIFE bundles.**
   - Heavy, optional code loads on first use, not at mount: shiki language and theme grammars, the mermaid/elk/cytoscape stack, katex, rrweb-player and xterm.
   - Find which import pulls each one in. For example, the chat highlighter already uses precompiled langs in a worker (`ui-kit-chat/src/styled/highlight-worker.ts`), so the full `@shikijs/langs` set comes from somewhere else, likely `@pierre/diffs` or a markdown or diagram dependency. Make that edge a dynamic import if it isn't one.
   - Code-split the bundle builds. Use one shared chunk directory for both entries (global and native), so the native build is a thin entry over the same chunks rather than a second full copy.
   - The bootstrap file keeps its current name and still works from a plain `<script src>`. Chunks resolve relative to that script's URL: capture `document.currentScript.src` and use it as the chunk base, or use a Vite or Rolldown-supported equivalent (check the Vite 8 and Rolldown docs for IIFE plus split chunks, or ESM chunks behind a tiny classic-script loader).
   - Every place that serves or copies the bundle serves the chunks too:
     - `native-page.ts` must serve the chunk directory, and must still zod-parse the requested file name (see AGENTS.md);
     - the site's `copy-widget-bundle.mjs` is deleted instead (see Decisions);
     - the test helper that inlines the bundle text must load it by URL instead, or serve it.
   - Target: the first-load bootstrap plus eager chunks at 2 MB gzip or less (shipped: 5.2 MB raw, 1.7 MB gzip). Lazy chunks only download when a message needs them.
2. **Source maps:**
   - The IIFE builds emit no `.map` by default.
   - A release build (CI `pnpm release` path) may keep maps, but without `sourcesContent`.
   - The ESM build keeps `sourcemap: true`. It is small, and consumers debug through it.
3. **Turbo outputs:**
   - `e2e/nextjs` and `e2e/nextjs-component` exclude `.next/dev/**`.
   - Check every e2e app's `turbo.json` outputs for other dev caches.
   - `apps/site` no longer copies the widget at all: nothing on the site loaded it (the site mounts through the ESM `@conciv/embed`).
4. **Bundle-size gate:** `packages/bundle-size` measures the bootstrap plus eager chunks, and reports lazy chunks separately.

## Acceptance

- `packages/embed/dist` after a build is about 30 MB in total (was 152 MB).
- A turbo cache entry for an embed build is about 6.9 MB (was 33.5 MB).
- The first load (loader, entry chunk and its static imports, plus the `mount-impl` chunk) is about 5.2 MB raw and 1.7 MB gzip.
- Widget integration tests, the embed unit tests, core's native-page IT and the plugin IT all pass against the new layout.
- In a real headless browser, mount the widget from the global bundle and check each of these:
  - a code block highlights;
  - a mermaid block renders;
  - katex renders;
  - the network panel shows the mermaid and katex chunks fetched only when used.
- The native page in the iOS example host still loads, checked through core's native-page IT.
- `pnpm --filter @conciv/app test:perf` is no worse than on main.

## Decisions

Decided 2026-11-11 with Omri, after the implementation measured the result:

- Ship the sizes as they are. The original targets (dist 15 MB, cache entry 5 MB, first load 2 MB raw) are not reachable without dropping features: the lazy chunks alone are about 19 MB, mostly every shiki grammar for tool-card code blocks (8.6 MB), mermaid with elk (about 7 MB) and themes. No grammar or elk cuts.
- Delete the site's copy of the global widget bundle (`apps/site/scripts/copy-widget-bundle.mjs`, its build step and its `.gitignore` lines). The site mounts the widget through the ESM `@conciv/embed`, so `conciv.dev/conciv-widget.global.js` had no reader.
