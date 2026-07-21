# First-party extension install convention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an end user install a non-built-in first-party conciv extension by dropping one re-export file in `conciv/extensions/`, loading both the server and client halves on every supported framework (Vite, Astro, Solid Start, Svelte, TanStack Start, and Next.js on Turbopack).

**Architecture:** The split between halves is done by package.json **conditional exports** (`browser`→client entry, `import`→server entry) — bundler-native, no conciv transform. Discovery is the **native `import.meta.glob('/conciv/extensions/*')`** (supported by Vite AND Turbopack ≥16.3), so there is no virtual module, no unplugin, no generated/registry file. The server half is already discovered by `loadServerExtensions` (fs + jiti). The only new client wiring is on Next.js (`nextjs-widget` uses the glob).

**Tech Stack:** pnpm workspace + turbo; `@conciv/extension-compiler` (discovery), `@conciv/plugin` (bundler integration, unplugin-based), `@conciv/it` (integration-test plugin with baked builtins), Solid client / Node server split, Playwright real-browser e2e, publint + attw for package release-safety.

**Spec:** `docs/superpowers/specs/2026-07-22-first-party-extension-install-design.md` (read it first).

## Global Constraints

- Code style (AGENTS.md): functions not classes; no IIFEs; ZERO code comments (the `conciv/no-comments` lint autofix DELETES them); strict TS — no `any`/`as`/`@ts-ignore`/non-null `!`; no `else`; no barrels; no abbreviated names; oxfmt (no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120).
- Tests drive the REAL app/code path — never mock the unit under test; no jsdom; widget UI in real Chromium (`browser.newPage()`, not `newContext()`); wait for `domcontentloaded` (never `networkidle`) on a live-widget page.
- Never add tests under `apps/examples/*`. e2e coverage lives in `e2e/*`.
- Commit with explicit pathspec. prek `lock.lock` abort → `pnpm format` then `git commit --no-verify`.
- `import.meta.glob` extension set and `loadServerExtensions` file set MUST be identical: `.ts,.tsx,.js,.jsx`.
- Conditional-export map (final, attw/publint-verified in Task 1) for every published extension `.` entry:
  ```json
  ".": {
    "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
    "import":  { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
  }
  ```
  `browser` listed first; nested `types` per condition; NO top-level `types`; NO root `default` fallback.
- Next.js folder discovery requires Turbopack ≥ 16.3; `next dev --webpack` is out of scope (documented).
- Dedup rule (single shared primitive): built-ins first, then folder extensions in deterministic sorted-filename order; first registration of a given non-empty `extension.name` wins; the SAME primitive runs before engine registration (server) and `mountConciv` (client).

---

## Task 0: GO/NO-GO — packed-package Turbopack discovery prototype

The entire "no generated file" design rests on one unproven assumption: that `import.meta.glob('/conciv/extensions/*')` executed from a file that lives in `node_modules` (`@conciv/plugin/nextjs-widget`) resolves to the **consumer app root** under Turbopack, from a **packed** (not `workspace:*`) install. Prove it before building anything else. If it fails, STOP and switch the design to an app-owned bootstrap (a tiny generated app-local entry) — do not proceed on the node_modules-glob path.

**Files:**
- Create (throwaway, under the scratchpad or a `spike/` dir — do NOT commit): a packed Next.js fixture app + a temporary `nextjs-widget` variant that globs.
- Reference: `packages/plugin/src/nextjs-widget.ts`, `packages/extension-compiler/src/extensions.ts`.

**Interfaces:**
- Produces: a written go/no-go finding at `.superpowers/sdd/task0-turbopack-glob-finding.md` (PASS → proceed with the plan as written; FAIL → the plan's Task 4 switches to the app-owned-entry fallback described in its notes).

- [ ] **Step 1: Build + pack the packages into a fixture**

Run from the worktree root:
```bash
pnpm turbo run build --filter=@conciv/plugin --filter=@conciv/it --filter=@conciv/embed --filter=@conciv/extension-tanstack
mkdir -p /tmp/conciv-spike && cd /tmp/conciv-spike
for p in plugin it embed extensions/tanstack core; do (cd "$OLDPWD/packages/$p" && npm pack --pack-destination /tmp/conciv-spike >/dev/null); done
ls /tmp/conciv-spike
```
Expected: one `.tgz` per package.

- [ ] **Step 2: Scaffold a real Next.js 16.3 app that installs the tarballs**

Create `/tmp/conciv-spike/app` as a minimal Next 16.3 app (App Router, `next dev` = Turbopack), install the `.tgz` files into its `node_modules`, add `instrumentation-client.ts` importing the widget, and add `conciv/extensions/tanstack.tsx` = `export {default} from '@conciv/extension-tanstack'`. Temporarily edit the installed `@conciv/plugin/dist/nextjs-widget.js` to call `import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', {eager:true})` and `mountConciv(Object.values(mods).map(m=>m.default).filter(Boolean))`.

- [ ] **Step 3: Run the matrix and record results**

For each of: (a) app-root layout, (b) nested-monorepo layout (app under `packages/app/`), (c) default `turbopack.root`, (d) widened `turbopack.root`:
```bash
cd /tmp/conciv-spike/app && next dev   # Turbopack
```
In a browser, confirm the tanstack client card/UI is present (glob resolved the app's `conciv/extensions`). Then add/remove/rename a stub during `next dev` and confirm HMR reflects it. Then `next build` and inspect the client chunk for the extension + absence of `node:` imports.

- [ ] **Step 4: Write the finding**

Write `.superpowers/sdd/task0-turbopack-glob-finding.md`: PASS/FAIL per matrix cell, the exact `turbopack.root` needed (if any), and the go/no-go decision. If any Turbopack cell FAILS, mark **NO-GO for node_modules glob** and specify the app-owned-entry fallback (a per-app `conciv/extensions/_bootstrap.tsx` the plugin generates once, imported by the widget) as the design for Task 4.

- [ ] **Step 5: Commit only the finding**

```bash
git add .superpowers/sdd/task0-turbopack-glob-finding.md
git commit -m "spike(nextjs): turbopack node_modules import.meta.glob go/no-go finding"
```

---

## Task 1: Conditional exports on `@conciv/extension-tanstack` (finalize + verify)

The prototype already added a flat `browser` condition. Replace it with the final nested-types map and verify with publint/attw on a PACKED tarball.

**Files:**
- Modify: `packages/extensions/tanstack/package.json` (exports `.` + add `./server`)
- Test: `packages/extensions/tanstack` publint/attw

**Interfaces:**
- Produces: the canonical export-map shape reused by Task 2 for the other three extensions.

- [ ] **Step 1: Write the export map**

Set `exports` in `packages/extensions/tanstack/package.json`:
```json
"exports": {
  ".": {
    "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
    "import": { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
  },
  "./client": { "types": "./dist/client.d.ts", "import": "./dist/client.js" },
  "./server": { "types": "./dist/server.d.ts", "import": "./dist/server.js" },
  "./package.json": "./package.json"
}
```

- [ ] **Step 2: Build + publint + attw on the packed package**

```bash
pnpm turbo run build --filter=@conciv/extension-tanstack
pnpm --filter @conciv/extension-tanstack publint
pnpm --filter @conciv/extension-tanstack attw
```
Expected: publint clean; attw shows `browser`→client and node→server resolutions, no `NoResolution`/`FalseESM` errors beyond the package's existing ignored profile. If attw rejects nested-types, adjust ordering (keep `types` first inside each branch) until green.

- [ ] **Step 3: Assert Node resolves the server entry**

```bash
node --input-type=module -e "import m from '@conciv/extension-tanstack'; console.log(m.name)"
```
Expected: prints `tanstack` (server default), no Solid/client init error.

- [ ] **Step 4: Commit**

```bash
git add packages/extensions/tanstack/package.json
git commit -m "feat(extension-tanstack): per-environment conditional exports (browser->client, node->server)"
```

---

## Task 2: Conditional exports on terminal / test-runner / whiteboard

**Files:**
- Modify: `packages/extensions/terminal/package.json`, `packages/extensions/test-runner/package.json`, `packages/extensions/whiteboard/package.json`

**Interfaces:**
- Consumes: the verified map shape from Task 1.

- [ ] **Step 1: Apply the same `.` map + `./server` subpath to each**

For each package, replace the `.` export with the Task 1 nested map (paths already `./dist/client.js` / `./dist/server.js`) and add `"./server"`. Leave `test-runner`'s extra runner subpaths (`./vitest`, `./jest`, …) unchanged.

- [ ] **Step 2: Build + publint + attw each**

```bash
pnpm turbo run build publint attw --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/terminal/package.json packages/extensions/test-runner/package.json packages/extensions/whiteboard/package.json
git commit -m "feat(extensions): per-environment conditional exports for terminal, test-runner, whiteboard"
```

---

## Task 3: Discovery primitives — anchored matching, unified set, shared dedup, fatal missing-default

**Files:**
- Modify: `packages/extension-compiler/src/extensions.ts`
- Create: `packages/extension-compiler/src/dedupe-extensions.ts`
- Test: `packages/extension-compiler/test/dedupe-extensions.test.ts`, `packages/extension-compiler/test/load-server-extensions.test.ts`

**Interfaces:**
- Produces:
  - `export function dedupeExtensions(extensions: readonly AnyExtension[]): AnyExtension[]` — first-wins by non-empty `name`, input order preserved (builtins passed first).
  - `EXTENSION_GLOB = '/conciv/extensions/*.{ts,tsx,js,jsx}'` (exported const, used by client bootstraps).
  - `loadServerExtensions` now: anchored file match, applies `dedupeExtensions([...builtins, ...folder])`, and throws a legible error (stub filename + cause) when a discovered module has no `default`.

- [ ] **Step 1: Write failing test for the dedup primitive**

`packages/extension-compiler/test/dedupe-extensions.test.ts`:
```ts
import {test, expect} from 'vitest'
import {dedupeExtensions} from '../src/dedupe-extensions.js'

const ext = (name: string, tag: string) => ({name, tag}) as never

test('first registration of a name wins, order preserved', () => {
  const out = dedupeExtensions([ext('terminal', 'builtin'), ext('tanstack', 'folder'), ext('terminal', 'folder')])
  expect(out.map((e: {name: string; tag: string}) => `${e.name}:${e.tag}`)).toEqual(['terminal:builtin', 'tanstack:folder'])
})

test('drops entries with an empty or missing name', () => {
  const out = dedupeExtensions([ext('', 'a'), {tag: 'b'} as never, ext('ok', 'c')])
  expect(out.map((e: {name: string}) => e.name)).toEqual(['ok'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/dedupe-extensions.test.ts`
Expected: FAIL — cannot find `../src/dedupe-extensions.js`.

- [ ] **Step 3: Implement the dedup primitive**

`packages/extension-compiler/src/dedupe-extensions.ts`:
```ts
import type {AnyExtension} from '@conciv/extension'

export function dedupeExtensions(extensions: readonly AnyExtension[]): AnyExtension[] {
  const seen = new Set<string>()
  const out: AnyExtension[] = []
  for (const extension of extensions) {
    const name = extension?.name
    if (typeof name !== 'string' || name.length === 0) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push(extension)
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/dedupe-extensions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write failing test for anchored matching + fatal missing-default**

`packages/extension-compiler/test/load-server-extensions.test.ts` (drives the REAL loader against a temp dir):
```ts
import {test, expect} from 'vitest'
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {loadServerExtensions} from '../src/extensions.js'

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-ext-'))
  mkdirSync(join(root, 'conciv/extensions'), {recursive: true})
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'conciv/extensions', name), body)
  return root
}

test('ignores non-source files like bad.ts.bak', async () => {
  const root = fixture({'a.tsx': "import {defineExtension} from '@conciv/extension'\nexport default defineExtension({name:'a'})", 'bad.ts.bak': 'throw new Error("must not load")'})
  const out = await loadServerExtensions(root, [])
  expect(out.map((e) => e.name)).toEqual(['a'])
})

test('a discovered module with no default export is a fatal, legible error', async () => {
  const root = fixture({'x.tsx': "export const notDefault = 1"})
  await expect(loadServerExtensions(root, [])).rejects.toThrow(/x\.tsx/)
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/load-server-extensions.test.ts`
Expected: FAIL — `bad.ts.bak` currently loads (regex not anchored) and missing-default currently returns silently.

- [ ] **Step 7: Fix `extensions.ts`**

In `packages/extension-compiler/src/extensions.ts`: anchor the matcher and unify the set, import + apply dedup, and make missing-default fatal.
```ts
import {dedupeExtensions} from './dedupe-extensions.js'

const EXTENSION_RE = /\.(?:ts|tsx|js|jsx)$/
const EXTENSION_GLOB = '/conciv/extensions/*.{ts,tsx,js,jsx}'
export {EXTENSION_GLOB}

function extensionFiles(root: string): string[] {
  try {
    return readdirSync(join(root, EXTENSION_DIR))
      .filter((name) => EXTENSION_RE.test(name) && !name.endsWith('.d.ts'))
      .sort()
      .map((name) => join(root, EXTENSION_DIR, name))
  } catch {
    return []
  }
}
```
Replace the loop body so a missing default throws:
```ts
  const builders: AnyExtension[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const split = await splitExtension(source, file, 'node')
    const evaluated = await jiti.evalModule(split?.code ?? source, {filename: file})
    const builder = (evaluated as {default?: AnyExtension}).default
    if (!builder) throw new Error(`conciv extension ${file} has no default export`)
    builders.push(builder)
  }
  return dedupeExtensions([...builtinServerExtensions, ...builders])
```
Note: `EXTENSION_RE` was already `\.(?:ts|tsx|js|jsx)$` end-anchored — verify at `extensions.ts:43`; if the live source differs (e.g. missing `$`), anchor it. The behavior change proven by the test is the missing-default throw + the `.d.ts` exclusion + deterministic `.sort()`.

- [ ] **Step 8: Point the client glob at the shared const + apply dedup at mount**

In `extensionsModuleSource`, replace the inline glob string with `EXTENSION_GLOB` and dedup the merged list:
```ts
    `import {dedupeExtensions} from '@conciv/extension-compiler/dedupe'`,
    `const mods = import.meta.glob(${JSON.stringify(EXTENSION_GLOB)}, {eager: true})`,
    'const userExtensions = Object.values(mods).map((m) => m && m.default).filter(Boolean)',
    `mountConciv(dedupeExtensions([${[...builtinNames, '...userExtensions'].join(', ')}]))`,
```
Add a `./dedupe` export to `packages/extension-compiler/package.json` mapping to `dedupe-extensions`.

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run && pnpm --filter @conciv/extension-compiler typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/extension-compiler/src/dedupe-extensions.ts packages/extension-compiler/src/extensions.ts packages/extension-compiler/package.json packages/extension-compiler/test/dedupe-extensions.test.ts packages/extension-compiler/test/load-server-extensions.test.ts
git commit -m "feat(extension-compiler): anchored discovery, unified extension set, shared dedup, fatal missing-default"
```

---

## Task 4: Next.js client discovery via `import.meta.glob` (register() stays sole engine owner)

Depends on Task 0. If Task 0 was GO, implement the node_modules-glob widget below. If Task 0 was NO-GO, implement the app-owned bootstrap fallback (see Step 6).

**Files:**
- Modify: `packages/plugin/src/nextjs-widget.ts`
- Reference (do NOT add a webpack plugin): `packages/plugin/src/core/nextjs.ts`
- Test: `e2e/nextjs` (Task 6)

**Interfaces:**
- Consumes: `EXTENSION_GLOB` (Task 3), `dedupeExtensions` (Task 3), `mountConciv` (`@conciv/embed`).

- [ ] **Step 1: Rewrite `nextjs-widget.ts` to discover + mount folder extensions**

```ts
/// <reference lib="dom" />
import {mountConciv} from '@conciv/embed'
import {dedupeExtensions} from '@conciv/extension-compiler/dedupe'
import {EXTENSION_GLOB} from '@conciv/extension-compiler/extensions'

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

function startWidget(): void {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  const mods = import.meta.glob(EXTENSION_GLOB, {eager: true})
  const userExtensions = Object.values(mods)
    .map((m) => (m as {default?: unknown}).default)
    .filter(Boolean) as never[]
  mountConciv(dedupeExtensions(userExtensions))
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWidget, {once: true})
  } else {
    startWidget()
  }
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}

export {}
```
Note: `import.meta.glob` must be a literal call — pass `EXTENSION_GLOB` only if the Task 0 spike confirmed Turbopack accepts a const arg; if it requires a string literal, inline `'/conciv/extensions/*.{ts,tsx,js,jsx}'` here and keep `EXTENSION_GLOB` as the single source used by Vite.

- [ ] **Step 2: Confirm register() remains the only engine boot on Next**

Read `packages/plugin/src/core/nextjs.ts`: `register()` calls `makeEngineBooter(..., NO_BUILTINS)`. Do NOT add `unplugin.webpack` to `withConciv` (its `webpack()` hook boots a second engine). No change needed here beyond verifying; if a webpack plugin was added anywhere for Next, remove it.

- [ ] **Step 3: Typecheck the plugin**

Run: `pnpm --filter @conciv/plugin typecheck && (cd packages/plugin && npx oxlint)`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/nextjs-widget.ts
git commit -m "feat(plugin): Next.js loads folder client extensions via import.meta.glob (Turbopack)"
```

- [ ] **Step 5 (only if Task 0 = GO): skip Step 6.**

- [ ] **Step 6 (only if Task 0 = NO-GO): app-owned bootstrap fallback**

If the node_modules glob does not target the consumer root under Turbopack, the plugin generates a tiny app-local `conciv/extensions/_bootstrap.tsx` at `register()`/config time (fs.writeFile, gitignored) that runs the glob from APP source, and `nextjs-widget` imports `#conciv-bootstrap` aliased (Vite resolve/load, `turbopack.resolveAlias`) to that file. Detail this in a revised Task 4 only if reached; do not build it speculatively.

---

## Task 5: Next.js version boundary — peer ranges + app pins

**Files:**
- Modify: `packages/plugin/package.json`, `packages/it/package.json` (peer range), `e2e/nextjs/package.json`, `e2e/nextjs-component/package.json`, `apps/examples/nextjs-app/package.json` (pins)

**Interfaces:** none.

- [ ] **Step 1: Raise the Next peer range for the integration packages**

In `packages/plugin/package.json` and `packages/it/package.json`, change the Next peer from `^15.3.0 || ^16.0.0` to `>=16.3.0` (folder discovery requires Turbopack 16.3). Confirm 16.3 is GA (not preview) at implementation time; if only preview, gate this task and record the decision in the plan's finding file.

- [ ] **Step 2: Bump the pins in every Next consumer**

Set `next` to `^16.3.0` in `e2e/nextjs`, `e2e/nextjs-component`, `apps/examples/nextjs-app`. Run `pnpm install`.

- [ ] **Step 3: Verify install + a Next app still boots**

```bash
pnpm install
cd e2e/nextjs && pnpm exec next build 2>&1 | tail -5
```
Expected: install resolves; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/package.json packages/it/package.json e2e/nextjs/package.json e2e/nextjs-component/package.json apps/examples/nextjs-app/package.json pnpm-lock.yaml
git commit -m "chore(nextjs): require Next >=16.3 (Turbopack import.meta.glob) for folder extension discovery"
```

---

## Task 6: e2e coverage — Vite (tanstack-start) + Next.js/Turbopack (packed), both halves

**Files:**
- Modify: `e2e/tanstack-start/` (add a folder-installed extension + assert it), `e2e/tanstack-start/tests/widget.spec.ts`
- Modify: `e2e/nextjs/` (packed install fixture + assert), `e2e/nextjs/tests/widget.spec.ts`
- Reference: `e2e/e2e-utils/src/config.ts`

**Interfaces:**
- Consumes: the installed `@conciv/extension-tanstack` (Task 1) as the reference extension.

- [ ] **Step 1: Install the reference extension into `e2e/tanstack-start` and add the stub**

Add `@conciv/extension-tanstack: workspace:*` to `e2e/tanstack-start/package.json`; create `e2e/tanstack-start/conciv/extensions/tanstack.tsx` = `export {default} from '@conciv/extension-tanstack'`; `pnpm install`.

- [ ] **Step 2: Write the Vite e2e assertion (both halves active)**

Extend `e2e/tanstack-start/tests/widget.spec.ts` (real browser). After the widget boots, assert the tanstack extension's client card is present AND its server tool is registered. Because tool calls need a harness, assert server registration via the extension's client-visible surface (its card renders in the widget's tool list / a UI the client half exposes). Use native locators (getByRole/getByText), no test-ids. Example addition:
```ts
test('a folder-installed extension loads its client half', async ({page}) => {
  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)
  await page.getByRole('button', {name: /conciv|assistant|widget/i}).first().click()
  await expect(page.getByText(/tanstack/i).first()).toBeVisible({timeout: 15000})
})
```
(Adjust the locators to the real widget surface that lists installed extensions/tools — inspect the running widget first.)

- [ ] **Step 3: Run the Vite e2e**

```bash
pnpm turbo run build --filter=@conciv/embed --filter=@conciv/extension-tanstack
cd e2e/tanstack-start && CONCIV_E2E=1 pnpm exec playwright test
```
Expected: PASS.

- [ ] **Step 4: Add the packed Next.js/Turbopack e2e**

In `e2e/nextjs`: add the `conciv/extensions/tanstack.tsx` stub + the extension dep; add a Playwright spec that (a) runs under `next dev` (Turbopack), (b) asserts the tanstack client half is visible in a real browser, and (c) inspects the built client chunk (`next build`) to assert it imported `client.js` and contains no `node:` import. Add a HMR add/remove test (create/delete a second stub, assert reflected). Keep at least one assertion tied to `client.js` resolution, not merely "UI appeared".

- [ ] **Step 5: Run the Next.js e2e**

```bash
cd e2e/nextjs && CONCIV_E2E=1 pnpm exec playwright test
```
Expected: PASS on Turbopack.

- [ ] **Step 6: Commit**

```bash
git add e2e/tanstack-start e2e/nextjs pnpm-lock.yaml
git commit -m "test(e2e): folder-installed extension loads both halves on Vite + Next.js/Turbopack"
```

---

## Task 7: Docs — install a first-party extension

**Files:**
- Create: `apps/site/content/docs/extensions/install-first-party.mdx` (path per the docs IA — inspect `apps/site/content/docs` structure first)
- Modify: the docs nav/meta for the extensions section; existing extension docs that mention loading

**Interfaces:** none.

- [ ] **Step 1: Write the install guide**

Cover: prerequisite (`pnpm add @conciv/extension-<name>`); the one-line `conciv/extensions/<name>.tsx` re-export (`export {default} from '@conciv/extension-<name>'`); that both halves wire automatically via conditional exports + `import.meta.glob`; supported frameworks incl. Next.js **on Turbopack (≥16.3)**; that built-ins need no install; that stub files may be `.ts/.tsx/.js/.jsx`. Add an author section: publish per-environment conditional exports (the Task 1 map) and the TS caveat (consumers need `customConditions:["browser"]` for browser-context editor types; otherwise server types show).

- [ ] **Step 2: Wire nav + build the docs site**

```bash
pnpm turbo run build --filter=site 2>&1 | tail -5
```
Expected: builds; the new page appears in nav.

- [ ] **Step 3: Commit**

```bash
git add apps/site/content/docs
git commit -m "docs(site): install a first-party extension (folder re-export, all frameworks)"
```

---

## Task 8: File follow-up issues (CLI + deferred items)

**Files:** none (GitHub issues).

**Interfaces:** none.

- [ ] **Step 1: File the CLI issue**

```bash
gh issue create --title "conciv extensions add <name> — shadcn-style CLI to install first-party extensions" --body "Resolve name->package; install with the detected package manager; scaffold conciv/extensions/<name>.tsx re-export; respect user config; idempotent; list/remove later. Depends on the conditional-export + folder re-export convention (spec 2026-07-22-first-party-extension-install-design.md). 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 2: File the deferred-scope issues**

`gh issue create` for: (a) baked builtins on Next.js (today `NO_BUILTINS`), (b) legacy `next dev --webpack` folder-install support (if ever needed).

- [ ] **Step 3: Record the issue numbers in the spec's follow-ups section, commit**

```bash
git add docs/superpowers/specs/2026-07-22-first-party-extension-install-design.md
git commit -m "docs(spec): link filed follow-up issues (CLI, next builtins, webpack)"
```

---

## Final gates (run after all tasks; serialize against any code-editing agents)

- [ ] `pnpm typecheck && pnpm build && pnpm lint`
- [ ] `pnpm turbo run test --force` (real failures = 0; concurrent-load flakes re-run in isolation)
- [ ] `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED
- [ ] `pnpm turbo run publint attw --filter=@conciv/extension-tanstack --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard --filter=@conciv/plugin --filter=@conciv/extension-compiler`
- [ ] A changeset (`.changeset/<name>.md`) naming the published packages that changed (conditional exports are a public-API change).
- [ ] The full e2e suite green in CI (Vite + Next.js/Turbopack).

## Self-review notes (spec coverage)
- Split (conditional exports) → Tasks 1, 2. Server discovery correction (build-first) → Task 3 tests + spec §2. Client discovery (native glob) → Tasks 3 (Vite const), 4 (Next). Turbopack risk → Task 0 gate. Dedup/fatal/anchored → Task 3. Peer ranges → Task 5. e2e both-halves cross-bundler → Task 6. Docs → Task 7. CLI + deferred → Task 8. attw/publint → Tasks 1, 2, final gates. Non-goals (unplugin/registry/config-option) → not built.
