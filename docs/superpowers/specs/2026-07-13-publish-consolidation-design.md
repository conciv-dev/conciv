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

- Inlines its internals (protocol, contract, grab, ui-kit-system) into dist.
- `solid-js` and `@ark-ui/solid` become peerDependencies.
- Spike S1 decides ui-kit-system handling (see Spikes).

## `@conciv/extension-testkit`

- Flips to public. Declares `@conciv/it` + `@conciv/extension` as peerDependencies.
- Inlines only glue (harness-testkit, extension-compiler plumbing); imports core's runtime
  through the new `@conciv/it` subpath export instead of inlining core (no double-shipped
  server, no version skew).
- Heavy/native deps (playwright, node-pty, libSQL) stay external regular deps.

## Spikes (before implementation)

- **S1 — singleton boundary.** ui-kit-system inlines into both `it` and `extension`. If any
  of its modules carry context shared between widget and extensions at runtime, two copies
  split that context (mount-externals landmine). Spike verifies against the mount-externals
  test; if shared, those modules move under `@conciv/extension` subpath exports and `it`
  externalizes them too.
- **S2 — testkit surface.** Enumerate what extension-testkit imports from `@conciv/core`
  and friends; that list defines the new `@conciv/it` subpath export.
- **S3 — changesets + private packages.** Verify the `fixed: [["@conciv/*"]]` group still
  versions correctly when 25 members are private (changesets `privatePackages` config), or
  drop privates from the fixed set.
- **S4 — node import closure.** Trace node-runtime imports from `@conciv/it`'s and the
  testkits' node entries; produces the definitive keep-dist vs src-only split.

## Source exports for browser-side internals

Private packages whose code only ever runs through a bundler (host vite in dev, embed's
vite build, tsdown at publish) stop building: `exports` point at `./src/*.ts(x)` and their
build scripts are deleted. Packages loaded by plain node at runtime keep dist, because the
plugin's process does `await import('@conciv/core/start')` and node cannot import raw TS
(the repo's `./x.js` specifier convention rules out node's native type stripping; runtime
TS loaders were considered and deferred — no jiti branch in plugin, no toolchain swap now.
A later spike evaluates nub (nubjs.com) as dev toolchain; if its hooks survive the
`turbo → vite` child-process chain, the node-chain dist builds can go too).

Classification rule: a package keeps dist iff it is published, or any of its exports are
imported by node at runtime — the plugin process, the core server, the CLI, or the testkits.
The exact split is computed during planning by tracing the node-side import closure from
`@conciv/it`'s and the testkits' node entries. Expected shape:

- **Keep dist (node chain + published):** it, plugin, core, harness, serve, db, tools, cli,
  protocol, contract, extension, extension-compiler, extension-testkit, harness-testkit,
  publish. First-party extensions keep dist for their server parts (loaded by node via the
  builtins path); their client entries may move to src.
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

1. Spikes S1–S4.
2. `@conciv/it` bundling (tsdown, embed assets, bin, testkit-runtime export).
3. `@conciv/extension` bundling.
4. `@conciv/extension-testkit` public flip + peer wiring.
5. Flip 25 packages `private: true`; update guards, changesets config, fallow config.
6. Src exports for browser-side internals (per S4 split); delete their build scripts.
7. Packed-install smoke in CI; extend `release:check`.
8. Docs.

## Out of scope

- nub (nubjs.com) as dev toolchain — separate later spike; would let the node chain drop
  dist builds too.
- Standalone CLI package (`npx conciv` works via `@conciv/it`'s bin).
- Publishing ui-kits as consumer libraries.
