# Task 0b — GO/NO-GO: packed alias→generated-entry prototype

**VERDICT: GO.** Chosen specifier: **`@conciv/app-extensions`** (first candidate; works in both bundlers and passes the plugin typecheck/build/pack).

The pivot's own linchpin holds: a bare specifier **dynamically imported from the node_modules-resident**
`@conciv/plugin/dist/nextjs-widget.js` is remapped by `turbopack.resolveAlias` (and webpack
`resolve.alias`) to the **app-local generated entry**, on GA Next **16.2.10**, across
{app-root, nested-monorepo} × {dev, build} × {turbopack, webpack} — all eight cells pass, and the
negative control correctly fails the build on both bundlers.

---

## 1. Chosen specifier + plugin typecheck/build/pack proof (Step 2b)

Candidate `@conciv/app-extensions` (first in order) succeeded end-to-end; the second candidate
(`conciv-app-extensions`) was not needed.

The WORKTREE `packages/plugin/src/nextjs-widget.ts` was temporarily edited to the Task 6 final shape
(exact source used):

```ts
/// <reference lib="dom" />

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

async function startWidget(): Promise<void> {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  const [{entries}, {mountConciv}, {dedupeExtensions}] = await Promise.all([
    import('@conciv/app-extensions'),
    import('@conciv/embed'),
    import('@conciv/extension-compiler/dedupe'),
  ])
  const picked = dedupeExtensions(entries)
  for (const drop of picked.dropped) console.warn('conciv extension dropped:', drop.source, drop.reason)
  console.log(
    'conciv picked:',
    picked.extensions.map((extension) => extension.name),
  )
  mountConciv(picked.extensions)
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void startWidget(), {once: true})
  } else {
    void startWidget()
  }
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export {}
```

Plus the ambient declaration `packages/plugin/src/core/app-extensions.d.ts`. **Key finding for Task 6:**
the declaration file **must be a global ambient script** (no top-level `import`/`export`) or the
`declare module` blocks are treated as module augmentations and NodeNext ignores them for resolution
(observed: `TS2307: Cannot find module '@conciv/app-extensions'`). Use inline `import(...)` type
references instead. The working file (exact source used):

```ts
declare module '@conciv/app-extensions' {
  export const entries: Array<{extension: unknown; source: string}>
}

declare module '@conciv/extension-compiler/dedupe' {
  export function dedupeExtensions(entries: Array<{extension: unknown; source: string}>): {
    extensions: Array<import('@conciv/extension').AnyExtension>
    dropped: Array<{source: string; reason: string}>
  }
}
```

(The dedupe declaration is included because `@conciv/extension-compiler/dedupe` does not exist in the
worktree yet — Task 3 — and the primary specifier under test is `@conciv/app-extensions`.)

Proof chain:

- `pnpm --filter @conciv/plugin typecheck` → **clean** (no `as`, no `@ts-ignore`).
- `pnpm turbo run build --filter=@conciv/plugin` → **built**; tsdown emitted a `[UNRESOLVED_IMPORT]`
  warning for `@conciv/app-extensions` and **treated it as an external dependency** — i.e. the bare
  specifier survives verbatim into the dist, exactly as required (it resolves at consumer bundle time
  via the alias, never at plugin build time).
- `pnpm pack --pack-destination /tmp/conciv-spike2/tgz` → inspected tarball:
  - `package/dist/nextjs-widget.js` contains `import("@conciv/app-extensions")`,
    `import("@conciv/embed")`, `import("@conciv/extension-compiler/dedupe")` inside `Promise.all`, the
    top-level `NODE_ENV !== 'production'` guard, and `console.log("conciv picked:", …)`.
  - `package/dist/nextjs-widget.d.ts` declares only the `Window` global — the ambient `declare module`
    blocks did **not** leak into the published declarations.

The source edits were reverted (`git checkout -- packages/plugin/src/nextjs-widget.ts`; removed the
added `src/core/app-extensions.d.ts`); `git status` shows only the finding doc.

## 2. Fixture (Step 1) — packed closed install on GA Next 16.2.10

Throwaway under `/tmp/conciv-spike2` (uncommitted). Reused Task 0's 27 tarballs (`/tmp/conciv-spike/tgz`)
for every package except `@conciv/plugin` (re-packed above to `/tmp/conciv-spike2/tgz`). Installed closed
via `pnpm.overrides` mapping every `@conciv/*` → `file:<abs>.tgz` + `pnpm install`. **Closure verified:**
every `@conciv/*` snapshot in the lockfile resolves to a `tarball: file:` — none to the registry. Three
transitive published packages not in Task 0's override list (`@conciv/serve`, `@conciv/solid-diffs`,
`@conciv/ui-kit-terminal`) were additionally packed and overridden to keep the install fully closed.

Installed node_modules patched per supplement:

- §B: added `dist/dedupe-extensions.js` + `dist/dedupe-extensions.d.ts` + `"./dedupe"` export to
  installed `@conciv/extension-compiler`.
- §C: replaced the `.` export of installed `@conciv/extension-tanstack` with the
  `browser`/`import` conditional map (`browser` → `client.js`, `import` → `server.js`).

Generated entry hand-written exactly as Task 5 will emit
(`<app>/.conciv/extensions-client.gen.tsx`):

```tsx
// generated by conciv — do not edit
import extension0 from '../conciv/extensions/tanstack'

export const entries = [{extension: extension0, source: '/conciv/extensions/tanstack.tsx'}]
```

Stub `conciv/extensions/tanstack.tsx` = `export {default} from '@conciv/extension-tanstack'`. App wiring
mirrors `e2e/nextjs` (`withConciv` in `next.config.ts`, `instrumentation-client.ts` importing
`@conciv/it/plugin/nextjs/widget` — a passthrough side-effect import of `@conciv/plugin/nextjs/widget`,
so the dynamic imports execute inside the packed `@conciv/plugin/dist/nextjs-widget.js`). `next.config.ts`
alias wiring (Step 2c):

```ts
turbopack: {resolveAlias: {'@conciv/app-extensions': './.conciv/extensions-client.gen.tsx'}},
webpack: (config) => {config.resolve.alias['@conciv/app-extensions'] = <abs>; return config},
```

## 3. The matrix (Step 3) — all eight cells + negative control

Real Chromium via the worktree's Playwright (`browser.newPage()`, `domcontentloaded` + console capture,
never `networkidle`). Dev pass signal: `conciv picked:` line contains `tanstack`, and no error names
`dist/server.js` or a `node:` specifier (proves §C's `browser` condition selected `client.js`).
Build pass signal: build compiles **with** a production-reachable probe page (`app/probe/page.tsx`)
that statically `import {entries} from '@conciv/app-extensions'` and renders the picked names into the
prerendered HTML — a real resolution signal, not mere compile success.

| Cell                                       | Result                        | Evidence                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app-root × turbopack **dev**               | **PASS**                      | `[log] conciv picked: [tanstack]`; no `dist/server.js`/`node:` errors                                                                                                                                                                                                                                                             |
| app-root × webpack **dev**                 | **PASS**                      | `[log] conciv picked: [tanstack]`; clean                                                                                                                                                                                                                                                                                          |
| nested × turbopack **dev**                 | **PASS**                      | `[log] conciv picked: [tanstack]`; clean (root inferred from `pnpm-workspace.yaml`)                                                                                                                                                                                                                                               |
| nested × webpack **dev**                   | **PASS**                      | `[log] conciv picked: [tanstack]`; clean                                                                                                                                                                                                                                                                                          |
| app-root × turbopack **build**             | **PASS**                      | `✓ Compiled successfully`; `/probe` prerendered HTML contains `PROBE picked: tanstack`                                                                                                                                                                                                                                            |
| app-root × webpack **build**               | **PASS**                      | `✓ Compiled successfully`; prerendered `PROBE picked: tanstack`                                                                                                                                                                                                                                                                   |
| nested × turbopack **build**               | **PASS**                      | `✓ Compiled successfully`; prerendered `PROBE picked: tanstack`                                                                                                                                                                                                                                                                   |
| nested × webpack **build**                 | **PASS**                      | `✓ Compiled successfully`; prerendered `PROBE picked: tanstack`                                                                                                                                                                                                                                                                   |
| **NEGATIVE CONTROL** (alias → nonexistent) | **FAILS build (as required)** | turbopack: `Module not found: Can't resolve '@conciv/app-extensions' … Import map: aliased to relative './.conciv/DOES-NOT-EXIST.gen.tsx'` for BOTH the probe static import and the widget dynamic import; webpack: `Module not found: Can't resolve '@conciv/app-extensions'` → `Build failed because of webpack errors`, exit 1 |

`next build` uses Turbopack by default on 16.2.10 (banner `▲ Next.js 16.2.10 (Turbopack)`); the webpack
build is `next build --webpack` (banner `(webpack)`). Both flags work as-is on 16.2 — no config toggle
needed.

**Prod elimination intact:** in the successful production builds, no client static chunk contains the
string `conciv picked:` — the `NODE_ENV !== 'production'`-guarded widget is DCE'd from the client
bundle. The probe (not the widget) is what makes the alias load-bearing for a clean prod build, which
is why the negative control is decisive. (Note the negative-control turbopack error also flagged the
widget's own dynamic import, so on this bundler the guarded widget is resolved before elimination too;
the probe guarantees the signal regardless of per-bundler DCE ordering.)

## 4. Regeneration viability (Step 4)

app-root × turbopack dev. Baseline generated entry (one import) → `conciv picked: [tanstack]`. While
`next dev` kept running, overwrote `.conciv/extensions-client.gen.tsx` to add a second stub import
(`conciv/extensions/second.tsx` = `export default {name: 'second'}`). With a persistent page held open
(`framenavigated` + console observer):

```
console: conciv picked: [tanstack]
--- editing generated entry to TWO ---
FULL-RELOAD (framenavigated)
console: conciv picked: [tanstack, second]
```

Restoring the one-import entry returned the browser to `conciv picked: [tanstack]`. **Update mechanism:
full page reload (not in-place HMR)** — Turbopack rebuilt the entry on the next request (39 ms) and the
browser reloaded. Decisive fact for the Task 6 watcher: **overwriting the generated file is picked up
by the running dev server without a restart.**

## 5. GO rule application (Step 5)

Rule: all eight cells (4 dev + 4 build, both layouts × both bundlers) MUST pass, plus the
negative-control build failure.

- 8/8 cells → **PASS**
- Negative control → **FAILS build** on both turbopack and webpack (as required)

→ **GO.** Proceed to Tasks 1–7 with the chosen alias specifier **`@conciv/app-extensions`**.

---

## Simplifications / caveats (full disclosure)

- **Engine (`register()`) stubbed across all cells.** The gate question — does a bundler alias remap a
  bare specifier dynamically imported from a node_modules-resident widget to an app-local file — is a
  purely **client-side bundler-resolution** question, independent of whether the server engine boots.
  The decisive `conciv picked: [tanstack]` client-graph signal is register-independent. It was stubbed
  to keep the client-graph signal clean for two reasons below.
- **The real engine does not boot on GA 16.2 in this packed fixture** (flag for Task 6, NOT an alias
  issue): with the real `register()`, boot fails server-side with
  `Failed to load external module @conciv/it-…/plugin/nextjs: Cannot find package '@conciv/plugin'
imported from .next/dev/node_modules/@conciv/it-…/dist/nextjs.js`. This is Next 16.2 relocating
  `serverExternalPackages` into `.next/dev/node_modules/` with a shallow copy that breaks the nested
  `@conciv/plugin` resolution on the (unchanged) `@conciv/it` tarball. It is server-side and orthogonal
  to the client alias linchpin. Task 6/7 must resolve how `withConciv`'s `serverExternalPackages`
  interacts with Next 16.2's external-module relocation.
- **The real engine's dev live-widget is separate noise.** When it does run, the engine injects its own
  dev live-widget served from source via a vite bridge; in this same-machine spike that path throws
  `@vitejs/plugin-react can't detect preamble` (worktree source served over `@fs`). This is unrelated to
  the packed nextjs-widget under test and does not affect the alias verdict.
- **`ERR_CONNECTION_REFUSED`** in the dev console is the widget's client reaching the absent engine API
  (`127.0.0.1:41700`); with the engine stubbed this is expected and is not a gate signal.
- **`FAB_COUNT 0`** was observed and not used as a signal; `console.log('conciv picked:', …)` fires
  before `mountConciv`, so the decisive signal is captured regardless of whether the FAB renders.
- **Toolchain:** Next `16.2.10` (repo e2e GA pin), Node 22.21.1, pnpm 10.33.4/11.7.0, Playwright from
  the worktree; `pnpm pack` (not `npm pack`); `browser.newPage()`; waited on `domcontentloaded` + the
  console signal (never `networkidle`).
