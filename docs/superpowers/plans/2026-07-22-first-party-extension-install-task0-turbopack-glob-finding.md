# Task 0 — GO/NO-GO: packed Turbopack `import.meta.glob` discovery gate

**VERDICT: NO-GO.**

The plan's core assumption — that `import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}')`,
executed verbatim from a node_modules-resident file (`@conciv/plugin/dist/nextjs-widget.js`), resolves
against the **consumer app root** under Turbopack — is **false**. It is refuted twice over, on
independent grounds, both empirically confirmed against a **real packed closed install**.

There are two independent gate failures, either one fatal:

1. **GA blocker.** Next.js 16.3 is **not released**. The design requires Turbopack `import.meta.glob`
   support, which does not exist in the current GA line (16.2.x).
2. **Semantic blocker (fatal regardless of when 16.3 ships).** Even on `next@16.3.0-preview.7`,
   Turbopack resolves `import.meta.glob` **relative to the calling file**, not the project root. The
   plan's verbatim leading-slash literal resolves to **nothing** from a node_modules package. Both
   MUST cells produce `conciv picked: []`.

---

## 1. GA status (verified `2026-07-22`)

`npm view next dist-tags`:

```
latest:  16.2.11
canary:  16.3.0-canary.93
preview: 16.3.0-preview.7
```

There is **no** `16.3.0` (or any stable 16.3.x) on npm — only canary/preview. Task 6 of the plan wants
to publish a peer range `>=16.3 <17` on `@conciv/it` / `@conciv/plugin`. A published package cannot
require an unreleased Next version. This alone blocks the plan as written until 16.3 goes GA.

## 2. Is `import.meta.glob` support really 16.3-only, or already in GA 16.2?

Confirmed 16.3-only. Minimal probe (`/tmp/glob-probe`, a node_modules-resident ESM file calling the
glob), driven with a real Chromium (Playwright, `domcontentloaded`, console capture):

| Next version       | `next build` (Turbopack) | Browser runtime                                                    |
| ------------------ | ------------------------ | ------------------------------------------------------------------ |
| `16.2.10` (GA)     | compiles "successfully"  | **throws**: `__TURBOPACK__import$2e$meta__.glob is not a function` |
| `16.3.0-preview.7` | compiles                 | `import.meta.glob` **is** a function (feature present)             |

So GA 16.2.x silently compiles the glob to a **broken stub**. The 16.3 requirement is real.

## 3. Turbopack `import.meta.glob` resolution semantics (16.3.0-preview.7)

Probes from a node_modules-resident file (`node_modules/fake-glob/index.js`) and from app source,
files present at the app root under `globtest/` and `conciv/extensions/`:

| Invocation (from calling file)                                        | Result                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `import.meta.glob('./sib/*.js', {eager:true})` (self-subtree)         | ✅ matched `./sib/a.js`, `./sib/b.js`                   |
| `import.meta.glob('/globtest/*.js', {eager:true})` (leading slash)    | ❌ `[]` (even with `turbopack.root` set)                |
| `import.meta.glob('/app/*.tsx', {eager:true})` (exists at proj root)  | ❌ `[]` — leading `/` is **not** the project root       |
| `import.meta.glob('../../conciv/extensions/*', {eager:true})` (`..`)  | ❌ `[]` — parent traversal in the pattern unsupported   |
| `import.meta.glob('*', {base:'/abs/path/globtest', eager:true})`      | ❌ ignored abs base; matched calling dir (`./index.js`) |
| `import.meta.glob('*', {base:'../../conciv/extensions', eager:true})` | ✅ matched `../../conciv/extensions/tanstack.js`        |

Consistent with the Turbopack docs (vercel/next.js
`docs/01-app/03-api-reference/08-turbopack.mdx`): _"keys are file paths **relative to the calling
file**"_, plus a `base` option "to override the base path" (relative base only; the `as` option and
`import.meta.globEager()` are unsupported).

**Implication.** The only form that reaches the app root from a node_modules file is a **relative
`base` with `../` traversal**. But the number of `../` from
`@conciv/plugin/dist/nextjs-widget.js` up to the consumer app root is **not fixed** and **not knowable
at package-publish time**: under pnpm the real path is
`node_modules/.pnpm/@conciv+plugin@<hash>/node_modules/@conciv/plugin/dist/…` (deep, layout-dependent);
under npm it is flattened differently. A hardcoded relative base cannot be portable, and the
leading-slash literal the plan mandates matches nothing. The premise is unfixable as a fixed literal in
a published node_modules file.

## 4. The 2×2 matrix — REAL packed closed install

**Fixture:** `/tmp/conciv-spike/` (throwaway, uncommitted). 27 workspace `@conciv/*` tarballs via
`pnpm pack` (no `"workspace:` protocol leaked; assertion passed). Installed closed via
`pnpm.overrides` mapping every `@conciv/*` → `file:<abs>.tgz` + `pnpm install`. Lockfile closure
verified: **no `@conciv/*` resolves to the npm registry.** Patched the installed node_modules per
supplement:

- §A: overwrote the real `@conciv/plugin/dist/nextjs-widget.js` with the Task 5 final widget — the
  **verbatim** `import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', {eager: true})`, the real
  `dedupeExtensions`/`toSortedEntries` import from `@conciv/extension-compiler/dedupe`, real
  `mountConciv` from `@conciv/embed`, plus the allowed fixture-only `console.log('conciv picked:', …)`.
- §B: added `dist/dedupe-extensions.js` + `"./dedupe"` export to installed `@conciv/extension-compiler`.
- §C: added the `browser`/`import` conditional map for `.` to installed `@conciv/extension-tanstack`.

The stub is exactly `conciv/extensions/tanstack.tsx` → `export {default} from '@conciv/extension-tanstack'`.
App wiring mirrors `e2e/nextjs` (`withConciv` in `next.config.ts`, `instrumentation-client.ts` importing
`@conciv/it/plugin/nextjs/widget`). Driven with real Chromium; pass signal per the brief is the
`conciv picked:` console line containing `tanstack`.

| Cell                          | turbopack.root | Result         | Evidence                                                                                                                                                                                                                                     |
| ----------------------------- | -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **app-root × default (MUST)** | inferred       | **FAIL**       | `conciv picked: []` — real engine (`register()`) booted, clean compile, `tanstack.tsx` present at app root yet not discovered                                                                                                                |
| app-root × widened            | set to parent  | **N/A / FAIL** | Widening `turbopack.root` relocates Next's `[project]` base → instrumentation/app discovery breaks (`Could not parse module '[project]/instrumentation.ts', file not found`); the glob is unaffected and still `[]` by the calling-file rule |
| nested × default              | inferred       | **FAIL**       | `conciv picked: []` — root inference succeeded (pnpm-workspace.yaml present, no widening needed), glob still empty                                                                                                                           |
| **nested × widened (MUST)**   | monorepo root  | **FAIL**       | `conciv picked: []` (app under `packages/app/`, `turbopack.root = path.resolve('../..')`)                                                                                                                                                    |

Additional checks (app-root × default):

- **`next build` (Turbopack, production):** `✓ Compiled successfully` — **no build error**. This is
  false comfort: the glob compiles but resolves to the same empty set (compile-success ≠
  discovery-success — exactly the risk the gate was designed to catch). Note the widget guard is
  `NODE_ENV !== 'production'`, so the glob does not execute at prod runtime; only dev does.
- **HMR (add / rename / remove a second stub during `next dev`):** `conciv picked: []` before and
  after every operation. HMR is moot — base discovery never resolves the app-root directory, so no
  file event can ever be picked up.

## 5. GO rule application

Rule: `app-root × default` MUST pass **AND** `nested × widened` MUST pass.

- `app-root × default` → **FAIL**
- `nested × widened` → **FAIL**

→ **NO-GO.**

- **turbopack.root the nested case needs:** none. The failure is calling-file-relative and therefore
  **root-independent** — no `turbopack.root` value rescues the leading-slash literal.
- **Can `withConciv` auto-supply a fix?** No. There is no `turbopack.root` (or other `next.config`)
  value `withConciv` could inject that makes a leading-slash glob in a node_modules file resolve to the
  app root.

## 6. Follow-up (plan rewrite — out of this plan's scope; STOP)

Per the brief, NO-GO ⇒ stop; do not start Task 1. The plan must be rewritten around an **app-local
entry** so the glob's calling file lives inside the consumer app tree at a **known, fixed relative
depth** to `conciv/extensions/`. Concretely, at `withConciv` config time, generate a small entry file
in the app (outside the globbed dir) whose `import.meta.glob('./conciv/extensions/*', …)` (or a
relative `base`) resolves deterministically, and alias the widget's discovery to it via
`turbopack.resolveAlias`. The "drop one re-export file, no generated file, fixed literal in the
published widget" design does not work under Turbopack.

---

## Simplifications / caveats (full disclosure)

- **Engine stubbing.** `app-root × default` (the primary MUST cell) ran with the **real** `register()`
  engine boot and produced `conciv picked: []`. For the widened/nested cells `register()` was stubbed
  to a no-op to isolate the **client** widget module graph from server-side engine-boot noise (the
  brief explicitly permits this: the widget graph `nextjs-widget → extension-compiler/dedupe → embed
mountConciv → glob` remained fully real and packed). `withConciv` still supplied
  `NEXT_PUBLIC_CONCIV_PORT`, so the widget executed. The glob result is client-side and independent of
  the engine.
- **`FAB_COUNT 0`** was observed and **not** used as a pass/fail signal. The gate is glob discovery,
  and `console.log('conciv picked:', …)` fires **before** `mountConciv`, so the decisive signal is
  captured regardless of whether the FAB renders (which additionally needs a live engine, absent here).
- **Next version tested:** `16.3.0-preview.7` (the newest 16.3 build on npm), since no GA 16.3 exists.
- **Toolchain:** Playwright 1.61.1 + Chromium from the worktree; `pnpm pack` (not `npm pack`);
  `browser.newPage()`; waited on `domcontentloaded` + console signal (never `networkidle`).
