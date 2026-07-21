# First-party extension install convention — design

Date: 2026-07-22
Branch: framework-inspection-extensions (PR #126)
Status: approved (design), pending implementation plan

## Problem

conciv extensions have two runtimes: a **server** half (Node — tools, adapters, `node:fs`,
diagnostics) and a **client** half (browser — Solid cards, `.render()`). Today the only ways to load an
extension are:

1. **Baked builtins** — `@conciv/it` (and any `createConcivUnplugin(builtins)` factory) hardcodes
   `serverExtensions: [obj, …]` + `clientEntries: ['pkg/client', …]`. Two things per extension, wired in
   plugin config. Not something an end user can do without editing plugin internals.
2. **App-local single-file** — a `conciv/extensions/*.tsx` file authored in the app, split at build time
   by the compiler (`splitExtension` node/browser + the client glob + `loadServerExtensions`).

A published, dual-runtime extension (e.g. `@conciv/extension-tanstack`) has no clean install path: you
cannot `import` one object and have it wire both bundles, because a passed JS object carries no module
specifier for the client bundle to import, and `transformConcivModule` skips `node_modules`.

## Goal

An end user installs a **non-built-in first-party extension** by dropping **one file** in
`conciv/extensions/`, with **zero plugin or compiler changes**. Built-in extensions stay auto-present.
Works across bundlers (vite/nextjs/astro) because it rides package resolution, not plugin wiring.

## Chosen approach: folder re-export + conditional exports (prototype-validated)

### Mechanism
1. **Published extensions expose per-environment code via package.json conditional exports on `.`:**
   ```json
   ".": {
     "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
     "import":  { "types": "./dist/server.d.ts", "default": "./dist/server.js" },
     "default": { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
   }
   ```
   `browser` (more specific, listed first) → client entry; `import`/`default` → server entry. The existing
   `./client` (and, added for parity, `./server`) explicit subpaths remain for direct/test use.
2. **Install = one re-export file** in the app's `conciv/extensions/`:
   ```ts
   export {default} from '@conciv/extension-tanstack'
   ```
3. **The EXISTING folder machinery loads both halves — unchanged:**
   - server: `loadServerExtensions` reads the folder, `splitExtension('node')` returns null for a bare
     re-export (no `defineExtension` marker) so the source is used as-is, jiti evals it; jiti resolves the
     package under Node conditions → `server.js` (`export default` = server extension).
   - client: `extensionsModuleSource`'s `import.meta.glob('/conciv/extensions/*')` imports the re-export;
     the client build resolves the package under the `browser` condition → `client.js` (Solid cards).
   - The **conditional export IS the split** — no `splitExtension` of the package needed, no
     `node_modules` transform.

### Why it works (validated)
- `resolveId`'s `@conciv/*`→src remap does not fight it: node_modules defers (`concivSrcEntry` returns
  null on node_modules); workspace-dev maps to the per-environment src (`client.tsx` for browser,
  `server.ts` for ssr) — exactly right.
- Prototype in `apps/examples/tanstack-start`: `/@conciv/extensions.js` glob includes the re-export; the
  compiled re-export resolves to `src/client.tsx` in the client build; widget mounts with **0 console
  errors and no `node:fs`/server-code leak**; the core engine boots healthy (so `loadServerExtensions`
  jiti-loaded the server half without throwing).

## Scope of this work

### In scope
1. **Conditional exports on ALL published extensions** so any is installable via folder re-export, even
   in an app that does not use `@conciv/it`'s builtins:
   - `@conciv/extension-tanstack`, `@conciv/extension-terminal`, `@conciv/extension-test-runner`,
     `@conciv/extension-whiteboard`.
   - Each already ships `.` (server) + `./client` (client) dual builds with `export default` on both
     entries — the change is purely the `.` export map (+ per-env types) and adding a `./server` subpath.
   - `publint`/`attw` must stay green (esm-only profile) after the export-map change — verify per package.
2. **Built-ins stay auto** — terminal/test-runner/whiteboard remain baked in `@conciv/it` (auto-present,
   no manual add). NOT retired. The folder machinery already merges builtins + folder-installed
   extensions, so an app can also fold-install any of them if it is not using the `@conciv/it` builtins.
3. **tanstack becomes the first non-built-in first-party install** — the example app
   (`apps/examples/tanstack-start`) keeps the prototype's `conciv/extensions/tanstack.tsx` re-export +
   the `@conciv/extension-tanstack` workspace dep, as the reference usage.
4. **Docs (apps/site, comprehensive doc site under `apps/site/content/docs`):**
   - New page: "Install a first-party extension" — the folder re-export convention, prerequisites (add
     the package dep), the one-line re-export, that both halves wire automatically, and that built-ins
     need no install.
   - Update existing extension docs to reference the convention; document the conditional-exports
     requirement for extension authors.

### Out of scope (this work) → captured as follow-ups
- **CLI `@conciv/extensions add "<name>"` (shadcn-style)** — SEPARATE GitHub issue, filed as part of this
  work, NOT built now. Requirements to capture in the issue: resolve extension name → package; install
  with the app's detected package manager; scaffold the `conciv/extensions/<name>.tsx` re-export; respect
  user config/preferences; idempotent; list/remove companions later.
- No `conciv({extensions: […]})` config option (folder re-export is the only blessed API).
- No retiring built-ins.

## Components touched

- `packages/extensions/{tanstack,terminal,test-runner,whiteboard}/package.json` — export maps.
- `apps/examples/tanstack-start/` — dep + `conciv/extensions/tanstack.tsx` (already prototyped) as the
  reference install.
- `apps/site/content/docs/**` (+ any docs route/nav) — the install guide + author guidance.
- No changes to `@conciv/plugin`, `@conciv/extension-compiler`, or the folder machinery.

## Testing

- Per-extension: `publint` + `attw` green after the export-map change (release-safety of the new
  conditions).
- An e2e/integration proof that a **folder-installed** extension loads both halves in a real app: the
  existing `apps/examples/tanstack-start` prototype is the model; formalize a check that (a) the client
  bundle resolves the re-export to the client entry and (b) the server engine registers the extension's
  tools. Follow the repo rule: drive the REAL app (no mocks of the unit under test); reuse
  `@conciv/extension-testkit` / a real vite dev server where a test is warranted.
- Do not add tests under `apps/examples/*` (demo apps); verify via the owning package or a real consumer
  check.

## Error handling / edge cases

- A re-export whose package is not installed → module resolution error at load; the folder loaders
  already tolerate a missing `.default` (skip) — ensure the failure is legible (surface, don't swallow).
- Conditional-export ordering: `browser` must precede `import`/`default` so client builds pick client;
  Node/ssr (no `browser` condition) fall through to server. Verify both a workspace-dev run and a
  simulated installed-package resolution.
- `types` per condition so editors/tsc resolve client types in browser context, server types otherwise.

## Non-goals

- Config-passing API, retiring built-ins, changing the plugin/compiler, building the CLI now.

## Open items to resolve during planning

- Exact `attw`/`publint`-safe shape of the nested conditional export (types nested under each condition
  vs a top-level `types`) — pick the one that passes both tools for the esm-only profile.
- Whether `@conciv/extension-test-runner`'s extra subpaths (`./vitest`, `./jest`, …) need any change
  (expected: none — only `.` gains the browser condition).
- Docs IA: where the install page sits in the existing docs nav.
