# First-party extension install convention (cross-bundler) — design

Date: 2026-07-22
Branch: framework-inspection-extensions (PR #126)
Status: approved (design v3), pending implementation plan
History: v1 (Vite-only) → v2 (unplugin universal virtual module — REJECTED: unplugin has no Turbopack
adapter) → **v3: native `import.meta.glob` + conditional exports** (Turbopack ≥16.3 supports both natively).

## Problem

conciv extensions have two runtimes: a **server** half (Node — tools, adapters, `node:fs`, diagnostics)
and a **client** half (browser — Solid cards, `.render()`). An end user cannot install a published
dual-runtime extension (e.g. `@conciv/extension-tanstack`) without editing plugin internals, and the
existing app-local `conciv/extensions/*` client discovery was assumed Vite-only.

Supported frameworks (`e2e/`): Vite-based (Vite, Astro, Solid Start, Svelte, TanStack Start) and **Next.js**
(default dev bundler: **Turbopack**; legacy `--webpack`). On Next.js today `nextjs-widget.ts` calls
`mountConciv([])` — zero client extensions.

## Key enabling facts (verified)
- **Turbopack (Next.js ≥16.3) natively supports `import.meta.glob`** — the same Vite-compatible API we
  already use — and it handles add/remove/rename invalidation itself. (Installed apps are on 16.2.x → a
  `next@^16.3` bump is required.)
- **Turbopack natively supports the `browser` export condition.**
- Legacy `next dev --webpack` does NOT support `import.meta.glob`; it is non-default and out of scope
  (documented as "Turbopack required for Next.js").

Therefore the folder mechanism needs **no virtual module, no unplugin, no generated/registry file** — both
halves are native on every framework we support.

**UNVERIFIED, go/no-go (codex r3):** `nextjs-widget` ships from `@conciv/plugin` (a `node_modules`
dependency), not app source. It is NOT established that `import.meta.glob('/conciv/extensions/*')` from a
dependency-owned file anchors to the *consumer's* app root under Turbopack (Turbopack has filesystem-root
restrictions, configurable via `turbopack.root`). This assumption is the linchpin of the whole "no
generated file" promise and MUST be proven by a packed-package prototype as the FIRST implementation step.
If it fails, the fallback is an app-owned bootstrap / small generated app-local entry.

## Goal

Install a non-built-in first-party extension by dropping **one re-export file** in `conciv/extensions/`;
it loads BOTH halves on Vite, Astro, Solid Start, Svelte, TanStack Start, and Next.js (Turbopack).

## Approach

### 1. Split = package.json conditional exports (bundler-native)
```json
".": {
  "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
  "import":  { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
}
```
`browser` first → client entry; `import` → server entry; nested `types` per condition. Vite and Turbopack
select `browser`→`client.js` in a real client graph and `import`→`server.js` under Node. Keep `./client`
and add a `./server` explicit subpath for direct/test use. Do NOT claim "every bundler" — the guarantee is
for the tested configurations (Vite client/ssr + Turbopack client/Node). Retain chunk-level assertions that
no `node:` import reaches the browser output.

Install stub (one file):
```ts
// conciv/extensions/tanstack.tsx
export {default} from '@conciv/extension-tanstack'
```

### 2. Server discovery — already cross-bundler
`loadServerExtensions` fs-reads `conciv/extensions/` + jiti-evals under Node conditions → `server.js`. Runs
for Vite (`configureServer`) and Next.js (`register`). **Correction (codex):** in workspace dev the server
loads the built `dist/server.js` (jiti resolves the package via Node conditions; it does NOT pass through
Vite's `concivSrcEntry`), while the Vite client maps `dist/client.js`→`src/client.tsx`. So **the extension
package must be built before its server half loads in workspace dev**; tests gate on a prior build.

### 3. Client discovery = native `import.meta.glob`
- **Vite** (unchanged): the served virtual module (`extensionsModuleSource`) uses
  `import.meta.glob('/conciv/extensions/*')` → `mountConciv([...builtins, ...folder])`.
- **Next.js/Turbopack**: `nextjs-widget.ts` uses the same `import.meta.glob('/conciv/extensions/*')`
  directly (a real module Turbopack bundles) and calls `mountConciv([...folder])`. Requires `next@^16.3`.
- The glob is the sole discovery mechanism — it is bundler-native, so **watch/add/remove invalidation is
  handled by Vite/Turbopack**, not by us (no manual `readdirSync` for the client). Pin the glob pattern to
  the project-root form (`/conciv/extensions/*.{ts,tsx,js,jsx}`) and verify root resolution in a nested
  monorepo consumer.
- Each re-export resolves through the `browser` condition → `client.js`; no conciv transform needed for a
  bare re-export (it contains no `.server()`/`.client()` to split).

### 4. Engine ownership on Next.js (codex #2)
Do NOT register the conciv unplugin webpack plugin in `withConciv` (its `webpack()` hook boots an engine —
would contend with `register()` for port 41700, and Turbopack ignores it anyway). **`register()` remains
the sole Next.js engine owner.** Next.js gains only the client-side `import.meta.glob` in `nextjs-widget`.

## Scope

### In scope
1. **Conditional exports on ALL published extensions** (tanstack, terminal, test-runner, whiteboard) so any
   is folder-installable. `.` export map (nested per-env `types`) + a `./server` subpath. `publint`+`attw`
   (esm-only) MUST pass with the packed shape — finalize the exact map via those tools.
2. **Built-ins stay auto** in `@conciv/it` (Vite). Folder-discovered + builtins are merged with **dedup**
   (see fixes). Note: Next.js currently ships `NO_BUILTINS` (no baked builtins on Next today) — unchanged
   here; folder-install works on Next regardless. (Baked-builtins-on-Next is a separate follow-up.)
3. **Client discovery**: `nextjs-widget` uses `import.meta.glob` + `mountConciv`; `next@^16.3` bump in the
   nextjs apps. Vite path unchanged. Dedup + fatal-error + extension-set fixes in `extensions.ts`.
4. **tanstack = the reference non-built-in install** — keep the prototype's example re-export + dep.
5. **Docs** (`apps/site/content/docs`): "install a first-party extension" page (the re-export, add the
   package dep, works on all frameworks incl. Next.js on Turbopack, built-ins need no install, allowed stub
   extensions) + author guidance (conditional-exports requirement; TS `customConditions:["browser"]` caveat
   — without it editors resolve server types).

### Out of scope → follow-ups (file as GitHub issues)
- **CLI `@conciv/extensions add "<name>"` (shadcn-style)** — resolve name→package, install with the
  detected package manager, scaffold the re-export, respect config, idempotent. NOT built now.
- Baked builtins on Next.js (NO_BUILTINS today).
- Legacy `next dev --webpack` folder-install support.
- `conciv({extensions})` config option; retiring built-ins.

## Codex findings — disposition (2 review rounds)
- **[HIGH] cross-bundler / Turbopack** — RESOLVED natively: Turbopack ≥16.3 supports `import.meta.glob` +
  `browser` condition; no unplugin, no virtual module, no generated registry.
- **[HIGH] Next double-boot / lost builtins** — RESOLVED: do not add the webpack plugin; `register()` is the
  sole engine owner (§4). Next builtins gap noted as separate follow-up.
- **[MED] workspace server uses built `dist`** — folded into §2 (build before server test).
- **[MED] conditional-export claim too broad** — narrowed to tested configs; chunk-level no-`node:` checks.
- **[MED] watch/invalidation** — RESOLVED by staying on native `import.meta.glob` (no manual fs scan).
- **[MED] root/path strategy** — glob pattern pinned to project-root form; nested-monorepo test required.
- **[MED] dedup** — ONE shared rule: built-ins first, first-registration-wins by non-empty `extension.name`;
  server merge and client `mountConciv` apply the SAME rule; reject/skip malformed (missing name) with a
  legible warning. Tests: duplicate built-in, duplicate folder files, conflicting implementations.
- **[LOW] fatal error** — a missing/broken import is fatal (jiti rejects, aborts boot). Surface the stub
  **filename + preserved resolver cause**; do NOT promise an extracted package specifier (arbitrary source).
- **[LOW] extension-set parity** — unify server + client to ONE set (`.ts/.tsx/.js/.jsx`); the client glob
  pattern matches the server `extensionFiles` set; docs state the same set (no `.ts/.tsx`-only contradiction).

## Testing — REAL e2e suites MUST cover this (hard requirement)
Per repo rules: drive the REAL app, no mocks of the unit under test, no jsdom, real browser for widget UI,
real dev servers; NEVER add tests under `apps/examples/*`.

- **Vite path — `e2e/tanstack-start`**: folder-install an extension; in a real browser assert the **client
  half is active** (its card/UI renders) AND the **server half registered** (its tool is callable). Extend
  the existing widget-boot spec so it asserts the installed extension is ACTIVE, not just that the widget
  mounts.
- **Next.js/Turbopack — `e2e/nextjs`**: same folder-install; real browser assertions for both halves under
  `next dev` (Turbopack), proving the cross-bundler `import.meta.glob` + `browser`-condition path. Bump
  `next@^16.3` there.
- **Resolution-matrix checks** (owning packages / testkit): Vite client→`client.js` (no `node:` in chunk);
  Node/jiti server→`server.js` (no Solid init); workspace symlink client→`src/client.tsx`; workspace
  server→built `dist/server.js`; packed `node_modules` install→both from `dist`; Turbopack client→
  `client.js`; TS resolution with/without `customConditions:["browser"]`.
- **Dedup**: tests for duplicate built-in vs folder, duplicate folder files, conflicting implementations.
- `publint`+`attw` per changed published package.

## Non-goals
unplugin/virtual-module/generated-registry client discovery; config-passing API; retiring built-ins;
building the CLI now; a new split transform (conditional exports do the split); legacy `--webpack` support.

## What the implementation plan MUST nail (codex round 3)
1. **GO/NO-GO FIRST STEP — packed-package Turbopack prototype.** Install `@conciv/plugin`/`@conciv/it` +
   the reference extension as a REAL tarball (`npm pack` into a fixture's `node_modules`), not `workspace:*`.
   Prove the dependency-owned `import.meta.glob` targets the consumer app root and works across: app-root +
   nested-monorepo layouts; default + widened `turbopack.root`; initial discovery + add/remove/rename during
   `next dev`; and both `next dev` (Turbopack) and `next build`. If it fails → switch to an app-owned entry
   (accept a small generated app-local bootstrap) before any further work.
2. **Next peer-range honesty.** `@conciv/plugin` + `@conciv/it` advertise `next: ^15.3.0 || ^16.0.0`; the
   widget would ship syntax unsupported on 15.x–16.2. Raise/model the Next boundary precisely (folder
   discovery requires ≥16.3) and audit EVERY Next consumer (`e2e/nextjs`, `e2e/nextjs-component`,
   `apps/examples/nextjs-app`), not just one.
3. **Packed e2e (not workspace:*).** At least one Next e2e installs packed `@conciv/it`/`@conciv/plugin` +
   the extension into a fixture; assert the client resolved `client.js` (not just "some UI appeared"), plus
   `next dev` runtime + `next build` chunk inspection + HMR add/remove/rename + a nested-monorepo fixture.
4. **One deterministic dedup/validation primitive.** A single shared pure function (built-ins first,
   first-registration-wins by non-empty `extension.name`, deterministic fs ordering) used before BOTH engine
   registration and `mountConciv`; warnings name every discarded filename/entry.
5. **Exact file matching.** `EXTENSION_RE` (`extensions.ts:43`) is not end-anchored — `bad.ts.bak` is
   accepted. Anchor it and match files only; unify server + client to ONE extension set.
6. **Fatal-error coverage incl. the currently-silent missing-default.** `loadServerExtensions` (`extensions.ts:68`)
   silently drops a module with no `default` — conflicts with the malformed policy. Cover read/transform/
   resolution failure + missing-default + malformed-default; surface stub filename + preserved cause.
7. **Conditional-export map validated from packed tarballs** with `publint`, `attw`, Node/jiti, Vite,
   Turbopack, and TypeScript (with and without `customConditions:["browser"]`).

## Other open items
- Exact `attw`/`publint`-safe conditional-export shape (finalize on a packed tarball).
- 16.3 preview-vs-stable release policy (is `^16.3` GA at plan time?).
- Docs IA placement of the install page.

---

## v4 amendment (post Task 0 NO-GO) — Next.js client discovery = generated app-local entry

Status: approved (user decision 2026-07-22). Supersedes §3's Next.js/Turbopack bullet and item 2 of
"What the implementation plan MUST nail".

**Task 0 finding** (docs/superpowers/plans/2026-07-22-first-party-extension-install-task0-turbopack-glob-finding.md,
commit 484787ac): the `import.meta.glob`-from-node_modules design is dead on Next. Two independent fatal
blockers: (1) Next 16.3 (first Turbopack `import.meta.glob`) is not GA — latest is 16.2.11, and GA 16.2
compiles the glob to a stub that throws at runtime; (2) even on 16.3-preview, Turbopack resolves glob
patterns RELATIVE TO THE CALLING FILE (no project-root leading-slash form), so a fixed literal in a
published node_modules file can never reach the consumer app root (the `../` depth is unknowable at
publish time under pnpm/npm layouts).

**Replacement mechanism (Next.js, Turbopack AND webpack):** fs-generated app-local entry.
- `withConciv` (runs in the consumer's `next.config.ts`, Node, app root, every config load) fs-reads
  `conciv/extensions/` (the same file set: `.ts/.tsx/.js/.jsx`, minus `.d.ts`, files only) and writes
  `.conciv/extensions-client.gen.tsx` — static extensionless imports of each stub + an exported
  provenance `entries` array (sorted filenames). Codegen via **knitwork** (unjs; `genImport` +
  `genSafeVariableName`; already in the lockfile transitively). Idempotent: rewrite only when content
  differs. `.conciv/` is already gitignored repo-wide (runtime-state dir).
- `withConciv` wires the widget to the entry via bundler alias: `turbopack.resolveAlias` for Turbopack
  plus an alias-only `webpack()` hook (`config.resolve.alias`) for `next dev --webpack` — webpack
  support is now IN scope (user decision). `register()` remains the sole engine owner; the webpack hook
  must not boot anything.
- `nextjs-widget` dynamic-imports the aliased specifier + `@conciv/embed` + the shared dedupe INSIDE
  `startWidget` (preserving the existing lazy pattern so the prod client bundle stays clean), then
  `mountConciv(dedupeExtensions(entries).extensions)`.
- Dev freshness: `register()` (dev-only) watches `conciv/extensions/` and regenerates the entry on
  add/remove/rename; the bundler hot-reloads the generated module natively (user decision: watcher, not
  restart-only).
- Consequences: the Next peer range stays `^15.3.0 || ^16.0.0` (no 16.3 requirement — the mechanism is
  bundler-agnostic); the "no generated file" promise is dropped for Next.js only; Vite keeps the native
  `import.meta.glob` virtual-module path unchanged; the `--webpack` follow-up issue is absorbed into
  scope.
- New GO/NO-GO (cheap, before build-out): prove on a packed closed install that a bare specifier
  imported (dynamically) from node_modules-resident `@conciv/plugin/dist/nextjs-widget.js` is remapped
  by `turbopack.resolveAlias`/webpack `resolve.alias` to the app-local generated file, on GA Next
  (16.2.x), app-root + nested layouts, dev + build. Fallback if alias fails: the app-owned
  `instrumentation-client.ts` imports the generated entry directly (one templated line — still no
  hand-written plumbing beyond the existing instrumentation file).
