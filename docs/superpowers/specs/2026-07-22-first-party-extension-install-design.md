# First-party extension install convention (cross-bundler) — design

Date: 2026-07-22
Branch: framework-inspection-extensions (PR #126)
Status: approved (design v2), pending implementation plan
Supersedes: v1 (Vite-only) — expanded to all supported frameworks after codex review.

## Problem

conciv extensions have two runtimes: a **server** half (Node — tools, adapters, `node:fs`, diagnostics)
and a **client** half (browser — Solid cards, `.render()`). Today an end user cannot install a published
dual-runtime extension (e.g. `@conciv/extension-tanstack`) without editing plugin internals:

1. **Baked builtins** — `@conciv/it` (any `createConcivUnplugin(builtins)`) hardcodes
   `serverExtensions: [obj]` + `clientEntries: ['pkg/client']`. Two things per extension, in plugin config.
2. **App-local single-file** — a `conciv/extensions/*.tsx` file authored in the app, split at build time
   by the compiler. But the CLIENT discovery is **Vite-only** (`import.meta.glob`) and the split transform
   is Vite-only, so this does not work on non-Vite frameworks.

Supported frameworks (from `e2e/`): Vite-based (Vite, Astro, Solid Start, Svelte, TanStack Start) **and
Next.js** (webpack + turbopack). On Next.js today `nextjs-widget.ts` mounts `mountConciv([])` — **zero**
client extensions — and no conciv virtual-module machinery runs.

## Goal

An end user installs a **non-built-in first-party extension** by dropping **one re-export file** in
`conciv/extensions/`, and it loads BOTH halves on **every supported framework** — Vite, Astro, Solid
Start, Svelte, TanStack Start, and Next.js (webpack + turbopack). Built-in extensions stay auto-present.

## Approach (no reinvention — mirror the unplugin ecosystem)

### 1. The split = package.json conditional exports (bundler-native)
Published extensions expose per-environment code via conditional exports on `.`:
```json
".": {
  "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
  "import":  { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
}
```
`browser` (listed first, more specific) → client entry; `import` → server entry; `types` nested inside
each so editors resolve the right `.d.ts`. Every bundler honors the `browser` condition for web/client
builds and omits it for Node/ssr — Vite, webpack, Rspack, turbopack alike. The conditional export IS the
split; no conciv transform of the package is required. `./client` and a new `./server` explicit subpath
remain for direct/test use.

Author-side install stub (one file, no build-time split needed because the package is pre-split by
condition):
```ts
// conciv/extensions/tanstack.tsx
export {default} from '@conciv/extension-tanstack'
```

### 2. Server discovery — already cross-bundler, keep
`loadServerExtensions` fs-reads `conciv/extensions/` and jiti-evals under Node conditions → `server.js`.
Runs identically for Vite (`configureServer`) and Next.js (`register` → `makeEngineBooter`). No change
except the fixes below (dedup, fatal-error clarity, extension set).

### 3. Client discovery — replace Vite-only glob with the unplugin universal pattern
Prior art (do NOT invent): `unplugin-auto-import` / `unplugin-vue-components` scan a directory with **fs**
(via `unimport`) and serve a **virtual module** through unplugin's **universal** `resolveId`/`load` hooks;
unplugin adapts this to every bundler (webpack via `webpack-virtual-modules`, Rspack `resolveId` ≥ v1.0,
Rollup/esbuild natively).

Changes:
- **Move** the extensions virtual module (`EXTENSIONS_VIRTUAL_ID`/`EXTENSIONS_ROUTE`) `resolveId`+`load`
  out of the Vite-only `makeViteHook` into the **shared unplugin hooks** in
  `packages/plugin/src/index.ts` so every bundler serves it.
- **Replace `import.meta.glob('/conciv/extensions/*')`** in `extensionsModuleSource` with **fs directory
  scanning** (reuse `extensionFiles`) that emits **explicit static imports** of each discovered file — the
  same shape already used for builtin `clientEntries`. Static imports resolve on every bundler and pull
  each re-export through the `browser` condition → `client.js`.
- Each framework's client bootstrap imports this virtual module. Vite: unchanged (served + script-tag
  injected). Next.js: `withConciv` must register the conciv unplugin's `.webpack` plugin so the virtual
  module is served, and `nextjs-widget` imports it instead of `mountConciv([])`.

### 4. Next.js webpack + turbopack (the one path that needs a prototype)
- `withConciv` wires the conciv unplugin webpack plugin into `next.config` so `resolveId`/`load` run.
- Validate **turbopack** (Next.js 15 default `next dev` bundler) — unplugin's turbopack support is newer;
  if the virtual module is not served under turbopack, provide a turbopack-experimental config or a
  documented `--webpack` dev fallback. This path gets a real prototype in the Next.js example, exactly as
  the Vite path was prototyped and proven.

## Scope

### In scope
1. **Conditional exports on ALL published extensions** (tanstack, terminal, test-runner, whiteboard) so any
   is folder-installable on any bundler. Each already ships `.` (server) + `./client` with `export default`
   on both entries; the change is the `.` export map (nested per-env `types`) + a `./server` subpath.
   `publint` + `attw` (esm-only) MUST pass with the packed shape — finalize the exact map via those tools.
2. **Built-ins stay auto** in `@conciv/it` (terminal/test-runner/whiteboard). NOT retired. The machinery
   merges builtins + folder-discovered (now with dedup — see fixes).
3. **Plugin: universal client discovery** — move the virtual-module serving to shared unplugin hooks; fs
   scan replaces `import.meta.glob`. `@conciv/plugin` + `@conciv/extension-compiler` change (v1's
   "zero plugin changes" no longer holds — this is a plugin change, scoped and shared across bundlers).
4. **Next.js integration** — register the unplugin webpack plugin in `withConciv`; `nextjs-widget` loads
   discovered client extensions; turbopack validated (prototype).
5. **tanstack = the reference non-built-in install** — keep the prototype's example re-export + dep.
6. **Docs** (`apps/site/content/docs`): "install a first-party extension" page (the re-export, add the
   package dep, works on all frameworks, built-ins need no install, `.ts`/`.tsx` stub only) + author
   guidance (conditional-exports requirement; TS `customConditions` note).

### Out of scope → follow-ups
- **CLI `@conciv/extensions add "<name>"` (shadcn-style)** — SEPARATE GitHub issue, filed as part of this
  work, NOT built now. Requirements: resolve name→package; install with the detected package manager;
  scaffold the `conciv/extensions/<name>.tsx` re-export; respect user config; idempotent; list/remove later.
- No `conciv({extensions})` config option (folder re-export is the only blessed API).
- No retiring built-ins.

## Codex-review fixes folded in (all 7)
1. **[HIGH] Cross-bundler** — was false in v1; this redesign makes the client path universal via unplugin.
2. **[MED] Workspace server resolution** — corrected: `loadServerExtensions` jiti-loads the package under
   Node conditions → **built `dist/server.js`** (not src); the client maps `dist/client.js`→`src/client.tsx`
   only via Vite's `concivSrcEntry`. Therefore **the extension package must be built before its server half
   loads in workspace dev**; state this and gate tests on a prior build.
3. **[MED] Conditional map is committed + tested, not an open item** — nested `types`, `browser` before
   `import`, `types` before runtime inside each branch. Note the **TypeScript caveat**: TS honors the
   `browser` custom condition only when the consumer sets `customConditions: ["browser"]`; without it,
   editors resolve server types. Document this; do NOT promise automatic browser-context editor types.
   Reconsider a root `default` fallback for an ESM-only package (can make `require()` resolve ESM); prefer
   `import`-only. Finalize via packed `publint`/`attw`.
4. **[MED] Test matrix** — assert every resolution path:
   - Vite client → `client.js`, no Node-only imports in the client chunk.
   - jiti/Node server → `server.js`, no Solid/client init.
   - workspace symlink client → `src/client.tsx`; workspace server → built `dist/server.js`.
   - packed `node_modules` install → both halves from `dist`.
   - **webpack + turbopack client → `client.js`** (the new cross-bundler paths).
   - TypeScript resolution with and without `customConditions: ["browser"]`.
   Smoke-only "healthy engine + zero console errors" is insufficient.
5. **[LOW] File-extension parity** — server accepts `.ts/.tsx/.js/.jsx`; the client glob only `.ts/.tsx`.
   Unify the fs scan to ONE extension set for both halves so a `.js` re-export is not silently server-only.
6. **[LOW] Dedup** — folder-discovered extensions are concatenated with builtins with no dedup; a manual
   re-export of a built-in while `@conciv/it` also bakes it double-registers/double-mounts. Add
   dedup-by-extension-name on both the server merge and the client `mountConciv` list.
7. **[LOW] Fatal-error clarity** — a missing/broken package import is **fatal** (jiti rejects → engine boot
   aborts), not "skipped". Surface a legible error including the stub path + package specifier.

## Components touched
- `packages/extensions/{tanstack,terminal,test-runner,whiteboard}/package.json` — export maps (+`./server`).
- `packages/extension-compiler/src/extensions.ts` — fs-scan discovery (drop `import.meta.glob`), unified
  extension set, dedup, fatal-error message.
- `packages/plugin/src/index.ts` — move virtual-module `resolveId`/`load` to shared unplugin hooks.
- `packages/plugin/src/core/nextjs.ts` (`withConciv`) + `packages/plugin/src/nextjs-widget.ts` — register
  the webpack plugin; load discovered client extensions.
- `apps/examples/tanstack-start/` (reference re-export, already prototyped) + `apps/examples/nextjs-app/` /
  `e2e/nextjs` (Next.js prototype + coverage).
- `apps/site/content/docs/**` — install guide + author guidance.

## Testing
Follow repo rules: drive the REAL app, no mocks of the unit under test, no jsdom, real browser for widget
UI, real dev servers for the bundler paths. Cover the full matrix in fix #4 across Vite and Next.js
(webpack + turbopack). `publint`/`attw` per changed published package. No tests under `apps/examples/*` —
verify via owning packages / real consumer (`e2e/nextjs`, testkit) checks.

## Error handling / edge cases
- Missing package → fatal, legible (fix #7). Duplicate install → deduped (fix #6). `.js` stub → still
  client-capable after the extension-set unification (fix #5).
- Condition ordering verified in BOTH a workspace-dev run and a packed-install resolution (fix #2/#3).
- turbopack virtual-module serving is the highest-risk unknown → prototype-gated (§4).

## Non-goals
Config-passing API; retiring built-ins; building the CLI now; changing how the split works (conditional
exports, not a new transform).

## Open items for planning
- Exact `attw`/`publint`-safe conditional-export shape (finalize by running the tools on a packed tarball).
- turbopack virtual-module feasibility (prototype outcome decides: native, experimental config, or
  documented webpack-dev fallback).
- Whether `@conciv/extension-test-runner`'s extra subpaths need any change (expected: none).
- Docs IA placement of the install page.
