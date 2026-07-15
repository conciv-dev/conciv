# Publish Consolidation: 27 → 3 Published Packages

Date: 2026-07-13
Status: approved design, pre-implementation

## Problem

27 `@conciv/*` packages publish to npm in lockstep, but users install exactly one (`@conciv/it`).
Every internal package carries publish overhead: publint/attw gates, export-map maintenance,
`PUBLIC_PACKAGES` guard entries, fallow `publicPackages` exemptions that weaken dead-code
detection. None of it buys anything for consumers.

## End state

Published to npm (lockstep version, one changeset group):

| Package                     | Audience                   | Contents                                                                                                |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@conciv/it`                | App devs                   | Plugin (all bundler variants), embed widget, core server, harness, first-party extensions, `conciv` bin |
| `@conciv/extension`         | Extension authors          | Extension SDK: types + runtime API, internals inlined                                                   |
| `@conciv/extension-testkit` | Extension authors (devDep) | Test harness for extensions; peers on the other two                                                     |

All other `@conciv/*` packages flip `private: true`. The workspace keeps its 30-package
structure — turbo caching, per-package tests, and fallow module boundaries are unchanged.
Bundling happens only at the publish boundary.

## Bundling boundary: the dedupe set

The extension-compiler dedupes `solid-js`, `solid-js/web`, `solid-js/store`,
`@tanstack/solid-router`, `@ark-ui/solid`, and `@conciv/extension` so widget and extensions
share one copy (context singletons). Rule for every published dist:

- Dedupe-set modules are NEVER inlined. They stay `external` in builds and appear as
  regular/peer dependencies.
- All other `@conciv/*` code inlines into the publishing package's dist.
- Third-party runtime deps (unplugin, vite, next, hono, node-pty, libSQL, playwright,
  solid ecosystem) stay external and become real `dependencies` of the published package —
  the union of the inlined packages' external deps, asserted by a new guard.

## `@conciv/it`

- tsdown flips `external: [/^@conciv\//]` to inlining all `@conciv/*` except `@conciv/extension`.
- Embed assets: the built embed lib and `conciv-widget.global.js` ship inside `it`'s dist.
  The plugin's existing `embedEntry` abs-path resolution points into `@conciv/it/dist`.
- First-party extensions (terminal, test-runner, whiteboard): client entries ship inside
  `it`'s dist; the plugin already passes `clientEntries` as abs paths.
- `bin: {conciv}` moves from `@conciv/cli` to `@conciv/it`; cli code inlines.
- New subpath export exposing the server/test surface `extension-testkit` needs
  (exact surface determined by spike S2).
- Bundled `.d.ts`; publint + attw remain release gates.

## `@conciv/extension`

- Inlines its non-shared internals (protocol, contract, grab) into dist.
- Gains subpath exports `./ui-system`, `./ui-chat`, `./ui-chat-tools`, `./ui-terminal`
  bundling the ui-kit packages — the single shared copy for widget + all extensions (S1).
- `solid-js` and `@ark-ui/solid` become peerDependencies.

## `@conciv/extension-testkit`

- Flips to public. Declares `@conciv/it` + `@conciv/extension` as peerDependencies.
- Inlines only glue (harness-testkit, extension-compiler plumbing); imports core's runtime
  through the new `@conciv/it` subpath export instead of inlining core (no double-shipped
  server, no version skew).
- Heavy/native deps (playwright, node-pty, libSQL) stay external regular deps.

## Spikes — RESOLVED (2026-07-13)

- **S1 — singleton boundary: shared UI rides `@conciv/extension` subpaths.** Context census:
  `@conciv/extension` (host-context), `ui-kit-chat` (23 files), `ui-kit-chat-tools` (6),
  `ui-kit-terminal` (1) carry Solid contexts; `ui-kit-system` carries none (its sharing
  requirement comes from Ark, guarded by mount-externals). These four ui-kits must be ONE
  copy across widget, first-party extensions, and third-party extensions — and they can't
  inline into both `it` and `extension`. Mechanism: `@conciv/extension` gains subpath
  exports (`./ui-system`, `./ui-chat`, `./ui-chat-tools`, `./ui-terminal`), each bundling
  the corresponding workspace package. `it`'s widget mount and extension client chunks
  externalize `@conciv/extension/*`; a publish-time alias rewrites `@conciv/ui-kit-chat` →
  `@conciv/extension/ui-chat` etc., so workspace source keeps its current imports. The
  compiler's existing `dedupe: ['@conciv/extension']` covers subpaths (name-level dedupe).
  Third-party authors get typed npm imports for the same primitives. Context-free helpers
  (solid-streamdown, solid-diffs, tools) inline into the single shared chunks. The
  mount-externals test evolves to assert `@conciv/extension/ui-*` externalization.
- **S2 — testkit surface is tiny.** extension-testkit's node-side needs are `{start}` from
  `@conciv/core/start` plus extension-compiler plumbing (`concivSolidConfig`, virtual-module
  helpers, `Builtins`/`NO_BUILTINS`) and harness-testkit glue (`makeCallTool`,
  `resolveSession`). Compiler plumbing + harness-testkit inline into testkit's dist (node
  glue, no contexts); only `@conciv/it/testkit-runtime` re-exporting `start` (+ types) is
  needed from `it`.
- **S3 — changesets works unchanged.** Verified empirically in a worktree: with 25 members
  `private: true` and one changeset naming `@conciv/it`, `changeset version` bumps the whole
  fixed group in lockstep (0.0.8 → 0.0.9), writes private changelogs, keeps `private` flags;
  publish skips privates. No config change.
- **S4 — node import closure is clean.** No node-side package (it, plugin, core, harness,
  serve, db, tools, cli, contract, extension-compiler, harness-testkit, publish) imports any
  browser-set package. First-party extensions already split at the export map: `.` = server
  entry (node, keeps dist), `./client` = path resolved via `import.meta.resolve` and handed
  to host vite (can be src). Embed is never node-imported — the plugin only needs its path —
  so embed goes src-only in dev; its lib + global-bundle builds remain as publish/test
  artifacts.

## Source exports for browser-side internals — SPLIT INTO PROJECT B

Original intent: browser packages export `./src` and stop building. Blocker found while
planning: in dev the HOST app's vite is the bundler for browser packages (embed's
`dist/mount.js` externalizes all `@conciv/*`), and host apps have no solid-tsx compiler and
no uno/postcss pipeline — raw `.tsx` exports break dev and lose widget styles.

Decision (2026-07-13): the conciv plugin will learn to compile `@conciv` source in any host
(solid transform + style pipeline). That is **Project B** with its own spec, spike round
(solid transform scope, uno/shadow-style pipeline, HMR, cold-start perf), and plan. This
migration (Project A) ships with dist exports unchanged; B flips browser packages to src
exports when it lands. Node-side packages keep dist regardless — node cannot import raw TS
with the repo's `./x.js` specifier convention; a later nub (nubjs.com) spike may lift that.

Classification below still matters for A: it defines which packages' dist `it` bundles
from, and B's future src flip only touches the browser set.

Classification rule: a package keeps dist iff it is published, or any of its exports are
imported by node at runtime — the plugin process, the core server, the CLI, or the testkits.
Split (verified by S4 import-closure trace):

- **Keep dist (node chain + published):** it, plugin, core, harness, serve, db, tools, cli,
  protocol, contract, extension, extension-compiler, extension-testkit, harness-testkit,
  publish. First-party extensions keep dist for their server entry (`.`, node-imported via
  the builtins path); their `./client` export moves to src (host vite compiles it).
- **Src-only (browser):** embed (lib export; the `conciv-widget.global.js` vite build stays
  as a test/publish artifact), ui-kit-system, ui-kit-chat, ui-kit-chat-tools, ui-kit-tap,
  ui-kit-terminal, solid-diffs, solid-streamdown, mascot, client, page, grab,
  storage-history, uno-preset.

Payoff: widget/UI edits become plain vite reload — no `rebuild dist → hard reload` loop —
and `pnpm test`'s build-first dependency shrinks to the node chain.

## Infra changes

- `packages/publish/src/guards.ts`: `PUBLIC_PACKAGES` shrinks to the 3 names.
- New guard: each published package's `dependencies` equals the union of its inlined
  internals' external deps (fails release on drift).
- fallow `.fallowrc.json` `publicPackages` shrinks to 3 — internal exports become fully
  auditable dead code.
- Docs: README install/architecture table, site docs, AGENTS.md releasing section.

## Verification

- `pnpm pack` all 3 → install tarballs into a temp app (clone of the tanstack-start
  example) → run the widget integration tests against the packed bundle.
- Extension-author smoke: author an extension against packed `@conciv/extension`, test it
  with packed `@conciv/extension-testkit`.
- Wire the packed-install smoke into `release:check` and CI.

## Migration order

1. ~~Spikes S1–S4~~ resolved, see above.
2. `@conciv/it` bundling (tsdown, embed assets, bin, testkit-runtime export).
3. `@conciv/extension` bundling.
4. `@conciv/extension-testkit` public flip + peer wiring.
5. Flip 25 packages `private: true`; update guards, changesets config, fallow config.
6. Packed-install smoke in CI; extend `release:check`.
7. Docs.

Project B (separate spec + plan, after A): plugin-side compilation of `@conciv` source in
host dev, then src exports for the browser set. Spike round:
`2026-07-13-src-exports-project-b-design.md`.

## Out of scope

- nub (nubjs.com) as dev toolchain — separate later spike; would let the node chain drop
  dist builds too.
- Standalone CLI package (`npx conciv` works via `@conciv/it`'s bin).
- Publishing ui-kits as consumer libraries.
