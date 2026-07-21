# First-party extension install convention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an end user install a non-built-in first-party conciv extension by dropping one re-export file in `conciv/extensions/`, loading both the server and client halves on every supported framework (Vite, Astro, Solid Start, Svelte, TanStack Start, and Next.js on Turbopack).

**Architecture:** The split between halves is package.json **conditional exports** (`browser`→client, `import`→server) — bundler-native, no conciv transform. Discovery is native **`import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}')`** (Vite + Turbopack ≥16.3) — no virtual module, unplugin, or generated file. Server discovery already exists (`loadServerExtensions`, fs + jiti). The only new client wiring is Next.js (`nextjs-widget` runs the glob).

**Tech Stack:** pnpm workspace + turbo; `@conciv/extension-compiler` (discovery), `@conciv/plugin` (unplugin integration), `@conciv/it` (integration-test plugin with baked builtins), `@conciv/extension-testkit` (real-engine `callTool`), Solid client / Node server, Playwright real-browser e2e, publint + attw.

**Spec:** `docs/superpowers/specs/2026-07-22-first-party-extension-install-design.md`. **Codex plan review (all folded here):** `.superpowers/sdd/codex-plan-review-findings.md`.

## Global Constraints

- Code style (AGENTS.md): functions not classes; no IIFEs; ZERO comments (lint autofix DELETES them); strict TS — **no `any`/`as`/`@ts-ignore`/non-null `!`** (use typed guards / `is` predicates); no `else`; no barrels; no abbreviated names; oxfmt (no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120).
- Tests drive REAL code — never mock the unit under test; no jsdom; widget UI in real Chromium (`browser.newPage()`, wait `domcontentloaded`, never `networkidle`).
- Never add tests under `apps/examples/*`. e2e lives in `e2e/*`.
- Commit with explicit pathspec. prek `lock.lock` abort → `pnpm format` then `git commit --no-verify`.
- **Published extensions in scope (5):** `@conciv/extension-tanstack`, `-terminal`, `-test-runner`, `-whiteboard`, **`-recorder`** (all in `PUBLIC_PACKAGES`, `packages/publish/src/guards.ts`).
- **Discovery file set is identical server + client:** `.ts,.tsx,.js,.jsx`, **excluding `*.d.ts`**, files only (not directories).
- **`import.meta.glob` must be a string LITERAL** in each call site (static-glob APIs require literals; a shared const is only for drift-comparison in tests). The literal is exactly `'/conciv/extensions/*.{ts,tsx,js,jsx}'`.
- Conditional-export map (final; attw/publint-verified on a PACKED tarball in Task 1) for every published extension `.`:
  ```json
  ".": {
    "browser": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
    "import":  { "types": "./dist/server.d.ts", "default": "./dist/server.js" }
  }
  ```
  `browser` first; nested `types`; NO top-level `types`; NO root `default`.
- Next.js folder discovery requires Turbopack ≥16.3; `next dev --webpack` is out of scope (documented).
- **Dedup + validation are ONE shared primitive over entries carrying provenance** (`{extension, source}`), used before BOTH engine registration (server) and `mountConciv` (client): built-ins first (source `builtin:<i>`), then folder entries in deterministic sorted-filename order; first non-empty `name` wins; every dropped entry is reported with its `source` and reason.

---

## Task 0: GO/NO-GO — packed Turbopack discovery prototype (hard gate)

The whole "no generated file" design rests on one unproven assumption: `import.meta.glob('/conciv/extensions/*')` executed from `@conciv/plugin/nextjs-widget` (which lives in the consumer's `node_modules`, not app source) resolves to the **consumer app root** under Turbopack, from a **packed** install. Prove it, testing the **exact final module graph** (Task 5's widget, which imports the Task 3 primitives). **If any MUST cell fails, STOP — do not start Task 1; the plan is rewritten around an app-local entry.**

**Files:**
- Create (throwaway under `/tmp`, NOT committed): a packed nested-monorepo Next fixture.
- Commit only: `.superpowers/sdd/task0-turbopack-glob-finding.md`.

**Interfaces:**
- Produces: the go/no-go finding file. GO → proceed. NO-GO → stop and rewrite the plan.

- [ ] **Step 1: Build + pack a CLOSED local dependency set**

Enumerate every workspace `@conciv/*` package in the transitive runtime graph of `@conciv/it` + `@conciv/plugin` + `@conciv/embed` + `@conciv/extension-tanstack` and `npm pack` all of them (not only the top four — else transitive deps resolve from the registry and the test is not reproducible):
```bash
pnpm turbo run build
mkdir -p /tmp/conciv-spike/tgz
node -e "const {execSync}=require('node:child_process');const roots=['it','plugin','embed','core','extension','extension-compiler','protocol','contract','db','harness','page','storage-history','ui-kit-chat','ui-kit-system','ui-kit-tap','solid','tools','extensions/tanstack','extensions/terminal','extensions/test-runner','extensions/whiteboard'];for(const r of roots){try{execSync('npm pack --pack-destination /tmp/conciv-spike/tgz',{cwd:'packages/'+r,stdio:'ignore'})}catch(e){console.log('skip',r)}}"
ls /tmp/conciv-spike/tgz | wc -l
```
Expected: a tarball per resolvable package. (Adjust `roots` to the actual transitive set discovered via `pnpm --filter @conciv/it... list` if a runtime import is missing.)

- [ ] **Step 2: Author the exact final widget under test**

In the fixture, install the tarballs and overwrite the installed `@conciv/plugin/dist/nextjs-widget.js` with the Task 5 final implementation (literal glob + typed guard + `dedupeExtensions` import from `@conciv/extension-compiler/dedupe` + `mountConciv`). This proves the real import graph, not a toy glob (per codex H-11).

- [ ] **Step 3: Run the explicit 2×2 matrix**

Cells = **layout** {app-root, nested-monorepo (app under `packages/app/`)} × **`turbopack.root`** {default, widened}. For each, `next dev` (Turbopack) + browser-check the tanstack client card renders, add/remove/rename a stub during dev (HMR), then `next build`.

- [ ] **Step 4: Apply the support rule + write the finding**

**GO rule:** `app-root × default` MUST pass AND `nested × widened` MUST pass. `nested × default` MAY be unsupported (documented, requires `turbopack.root`). `app-root × widened` should pass. Record per-cell PASS/FAIL, the exact `turbopack.root` the nested case needs, and whether `withConciv` can auto-supply it. Write `.superpowers/sdd/task0-turbopack-glob-finding.md` with a single GO or NO-GO. NO-GO ⇒ stop; the follow-up is a plan rewrite around an app-local entry generated at `withConciv` config time (outside the globbed dir, aliased via `turbopack.resolveAlias`), which is out of this plan's scope.

- [ ] **Step 5: Commit the finding**

```bash
git add .superpowers/sdd/task0-turbopack-glob-finding.md
git commit -m "spike(nextjs): turbopack node_modules import.meta.glob 2x2 go/no-go finding"
```

---

## Task 1: Conditional exports on `@conciv/extension-tanstack` (verify on a PACKED tarball)

**Files:** Modify `packages/extensions/tanstack/package.json`. Verify via a packed-install fixture.

**Interfaces:** Produces the canonical export-map shape (reused by Task 2).

- [ ] **Step 1: Write a failing packed-resolution check**

Create `packages/extensions/tanstack/test/packed-resolution.it.test.ts` that packs the built package into a temp dir and asserts Node resolves the SERVER entry and a Vite/browser resolver resolves the CLIENT entry:
```ts
import {test, expect} from 'vitest'
import {execFileSync} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

test('packed package resolves server under node and client under browser condition', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-packed-'))
  execFileSync('npm', ['pack', '--pack-destination', dir], {cwd: process.cwd()})
  const tgz = execFileSync('sh', ['-c', `ls ${dir}/*.tgz`]).toString().trim()
  execFileSync('npm', ['init', '-y'], {cwd: dir})
  execFileSync('npm', ['install', tgz], {cwd: dir})
  const nodeName = execFileSync('node', ['--input-type=module', '-e', "import m from '@conciv/extension-tanstack'; process.stdout.write(m.name)"], {cwd: dir}).toString()
  expect(nodeName).toBe('tanstack')
  const browserResolved = execFileSync('node', ['--input-type=module', '-e', "import {resolve} from 'node:module'; process.stdout.write(import.meta.resolve('@conciv/extension-tanstack', undefined))"], {cwd: dir, env: {...process.env}}).toString()
  expect(browserResolved).toMatch(/server\.js$/)
})
```
(The browser-condition assertion is fully exercised by the resolution-matrix task; this IT just guards the server default + packability.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/extension-tanstack exec vitest run test/packed-resolution.it.test.ts`
Expected: FAIL (until the map + build are correct).

- [ ] **Step 3: Write the export map**

Set `exports` in `packages/extensions/tanstack/package.json` to the Global-Constraints map for `.`, plus `"./client"`, `"./server"`, `"./package.json"`.

- [ ] **Step 4: Build + run the IT + publint + attw**

```bash
pnpm turbo run build --filter=@conciv/extension-tanstack
pnpm --filter @conciv/extension-tanstack exec vitest run test/packed-resolution.it.test.ts
pnpm --filter @conciv/extension-tanstack publint
pnpm --filter @conciv/extension-tanstack attw
```
Expected: IT PASS; publint clean; attw shows browser→client, node→server, no unignored errors. If attw rejects nested types, keep `types` first inside each branch until green.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/tanstack/package.json packages/extensions/tanstack/test/packed-resolution.it.test.ts
git commit -m "feat(extension-tanstack): per-environment conditional exports (verified on packed tarball)"
```

---

## Task 2: Conditional exports on terminal / test-runner / whiteboard / recorder

**Files:** Modify each package.json; **add `publint`/`attw` scripts to `@conciv/extension-whiteboard`** (it lacks them today).

**Interfaces:** Consumes the Task 1 map shape.

- [ ] **Step 1: Add missing scripts to whiteboard**

In `packages/extensions/whiteboard/package.json` `scripts`, add `"publint": "publint"` and `"attw": "attw --pack . --profile esm-only"` (match the other extension packages).

- [ ] **Step 2: Apply the `.` map + `./server` to all four**

Apply the Global-Constraints `.` map + `"./server"` to `terminal`, `test-runner`, `whiteboard`, `recorder`. Leave `test-runner`'s runner subpaths untouched.

- [ ] **Step 3: Build + publint + attw all four**

```bash
pnpm turbo run build publint attw --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard --filter=@conciv/extension-recorder
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add packages/extensions/terminal/package.json packages/extensions/test-runner/package.json packages/extensions/whiteboard/package.json packages/extensions/recorder/package.json
git commit -m "feat(extensions): per-environment conditional exports for terminal, test-runner, whiteboard, recorder"
```

---

## Task 3: Discovery primitives — provenance dedup/validation, exact file matching, fatal errors

**Files:**
- Create: `packages/extension-compiler/src/dedupe-extensions.ts`, `packages/extension-compiler/src/extension-guard.ts`
- Modify: `packages/extension-compiler/src/extensions.ts`, `packages/extension-compiler/tsdown.config.ts` (add build entry), `packages/extension-compiler/package.json` (add `./dedupe` export)
- Test: `packages/extension-compiler/test/dedupe-extensions.test.ts`, `packages/extension-compiler/test/load-server-extensions.test.ts`

**Interfaces:**
- Produces:
  - `type ExtensionEntry = {extension: unknown; source: string}`
  - `type DedupeResult = {extensions: AnyExtension[]; dropped: Array<{source: string; reason: string}>}`
  - `function dedupeExtensions(entries: readonly ExtensionEntry[]): DedupeResult`
  - `function isExtension(value: unknown): value is AnyExtension` (name-based guard)
  - `EXTENSION_GLOB = '/conciv/extensions/*.{ts,tsx,js,jsx}'` (const; drift-comparison only — call sites use the literal)
  - `loadServerExtensions(root, builtins)`: `Dirent.isFile()` + `.d.ts` exclusion + provenance dedup + fatal read/transform/eval/missing-default.

- [ ] **Step 1: Write failing tests for the guard + dedup provenance**

`packages/extension-compiler/test/dedupe-extensions.test.ts`:
```ts
import {test, expect} from 'vitest'
import {dedupeExtensions} from '../src/dedupe-extensions.js'
import {isExtension} from '../src/extension-guard.js'

test('isExtension requires an object with a non-empty string name', () => {
  expect(isExtension({name: 'a'})).toBe(true)
  expect(isExtension({name: ''})).toBe(false)
  expect(isExtension({})).toBe(false)
  expect(isExtension(null)).toBe(false)
  expect(isExtension(() => {})).toBe(false)
})

test('built-ins win over folder on name collision; deterministic order; provenance in dropped', () => {
  const r = dedupeExtensions([
    {extension: {name: 'terminal'}, source: 'builtin:0'},
    {extension: {name: 'tanstack'}, source: '/app/conciv/extensions/tanstack.tsx'},
    {extension: {name: 'terminal'}, source: '/app/conciv/extensions/terminal.tsx'},
    {extension: {name: ''}, source: '/app/conciv/extensions/broken.tsx'},
    {extension: 42, source: '/app/conciv/extensions/notext.tsx'},
  ])
  expect(r.extensions.map((e) => e.name)).toEqual(['terminal', 'tanstack'])
  expect(r.dropped).toEqual([
    {source: '/app/conciv/extensions/terminal.tsx', reason: 'duplicate-name:terminal'},
    {source: '/app/conciv/extensions/broken.tsx', reason: 'invalid-extension'},
    {source: '/app/conciv/extensions/notext.tsx', reason: 'invalid-extension'},
  ])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/dedupe-extensions.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the guard + dedup**

`packages/extension-compiler/src/extension-guard.ts`:
```ts
import type {AnyExtension} from '@conciv/extension'

export function isExtension(value: unknown): value is AnyExtension {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value)) return false
  const name = value.name
  return typeof name === 'string' && name.length > 0
}
```
`packages/extension-compiler/src/dedupe-extensions.ts`:
```ts
import type {AnyExtension} from '@conciv/extension'
import {isExtension} from './extension-guard.js'

export type ExtensionEntry = {extension: unknown; source: string}
export type DedupeResult = {extensions: AnyExtension[]; dropped: Array<{source: string; reason: string}>}

export const EXTENSION_GLOB = '/conciv/extensions/*.{ts,tsx,js,jsx}'

export function dedupeExtensions(entries: readonly ExtensionEntry[]): DedupeResult {
  const seen = new Set<string>()
  const extensions: AnyExtension[] = []
  const dropped: Array<{source: string; reason: string}> = []
  for (const {extension, source} of entries) {
    if (!isExtension(extension)) {
      dropped.push({source, reason: 'invalid-extension'})
      continue
    }
    if (seen.has(extension.name)) {
      dropped.push({source, reason: `duplicate-name:${extension.name}`})
      continue
    }
    seen.add(extension.name)
    extensions.push(extension)
  }
  return {extensions, dropped}
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/dedupe-extensions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing loader tests (dirs, .d.ts, missing-default, collision, read/eval failure)**

`packages/extension-compiler/test/load-server-extensions.test.ts` drives the REAL loader against temp dirs:
```ts
import {test, expect} from 'vitest'
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {loadServerExtensions} from '../src/extensions.js'

const EXT = "import {defineExtension} from '@conciv/extension'\nexport default defineExtension"

function fixture(files: Record<string, string>, dirs: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-ext-'))
  const base = join(root, 'conciv/extensions')
  mkdirSync(base, {recursive: true})
  for (const d of dirs) mkdirSync(join(base, d), {recursive: true})
  for (const [name, body] of Object.entries(files)) writeFileSync(join(base, name), body)
  return root
}

test('ignores a directory whose name matches the extension pattern', async () => {
  const root = fixture({'a.tsx': `${EXT}({name:'a'})`}, ['nested.ts'])
  const out = await loadServerExtensions(root, [])
  expect(out.map((e) => e.name)).toEqual(['a'])
})

test('ignores .d.ts declaration files', async () => {
  const root = fixture({'a.tsx': `${EXT}({name:'a'})`, 'types.d.ts': 'export type X = 1'})
  const out = await loadServerExtensions(root, [])
  expect(out.map((e) => e.name)).toEqual(['a'])
})

test('a discovered module with no default export is fatal and names the file', async () => {
  const root = fixture({'x.tsx': 'export const notDefault = 1'})
  await expect(loadServerExtensions(root, [])).rejects.toThrow(/x\.tsx/)
})

test('built-in wins over a folder file of the same name', async () => {
  const builtin = {name: 'terminal'} as never
  const root = fixture({'terminal.tsx': `${EXT}({name:'terminal'})`, 'a.tsx': `${EXT}({name:'a'})`})
  const out = await loadServerExtensions(root, [builtin])
  expect(out.filter((e) => e.name === 'terminal').length).toBe(1)
  expect(out[0]).toBe(builtin)
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @conciv/extension-compiler exec vitest run test/load-server-extensions.test.ts`
Expected: FAIL — directory + `.d.ts` currently pass the regex; missing-default is silent; no dedup.

- [ ] **Step 7: Rewrite the loader in `extensions.ts`**

Replace `extensionFiles` and the loader body:
```ts
import {readdirSync, readFileSync} from 'node:fs'
import {dedupeExtensions, type ExtensionEntry} from './dedupe-extensions.js'

const EXTENSION_RE = /\.(?:ts|tsx|js|jsx)$/

function extensionFiles(root: string): string[] {
  try {
    return readdirSync(join(root, EXTENSION_DIR), {withFileTypes: true})
      .filter((entry) => entry.isFile() && EXTENSION_RE.test(entry.name) && !entry.name.endsWith('.d.ts'))
      .map((entry) => entry.name)
      .sort()
      .map((name) => join(root, EXTENSION_DIR, name))
  } catch {
    return []
  }
}

export async function loadServerExtensions(
  root: string,
  builtinServerExtensions: readonly AnyExtension[],
): Promise<AnyExtension[]> {
  const builtinEntries: ExtensionEntry[] = builtinServerExtensions.map((extension, index) => ({
    extension,
    source: `builtin:${index}`,
  }))
  const files = extensionFiles(root)
  if (files.length === 0) return dedupeExtensions(builtinEntries).extensions
  const jiti = createJiti(pathToFileURL(join(root, 'noop.js')).href, {
    jsx: {runtime: 'automatic', importSource: 'solid-js'},
  })
  const folderEntries: ExtensionEntry[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const split = await splitExtension(source, file, 'node')
    const evaluated = await jiti.evalModule(split?.code ?? source, {filename: file})
    const value = evaluated && typeof evaluated === 'object' && 'default' in evaluated ? evaluated.default : undefined
    if (value === undefined) throw new Error(`conciv extension ${file} has no default export`)
    folderEntries.push({extension: value, source: file})
  }
  const result = dedupeExtensions([...builtinEntries, ...folderEntries])
  for (const drop of result.dropped) logError(`conciv extension dropped: ${drop.source} (${drop.reason})`)
  return result.extensions
}
```
Read/transform/eval failures already throw from `readFileSync`/`splitExtension`/`jiti.evalModule`; the file path is in scope via the loop (jiti errors carry the filename). Use the package's existing `logError` (import it; if none, `console.error`).

- [ ] **Step 8: Update the client generator + build entry + export**

In `extensionsModuleSource`, generate provenance entries + shared dedup (LITERAL glob):
```ts
    `import {dedupeExtensions} from '@conciv/extension-compiler/dedupe'`,
    `const mods = import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', {eager: true})`,
    `const folderEntries = Object.entries(mods).filter(([k]) => !k.endsWith('.d.ts')).map(([source, m]) => ({extension: m && m.default, source}))`,
    `const builtinEntries = [${builtinNames.map((n, i) => `{extension: ${n}, source: 'builtin:${i}'}`).join(', ')}]`,
    `const picked = dedupeExtensions([...builtinEntries, ...folderEntries])`,
    `for (const d of picked.dropped) console.warn('conciv extension dropped:', d.source, d.reason)`,
    `mountConciv(picked.extensions)`,
```
Add `'src/dedupe-extensions.ts'` and `'src/extension-guard.ts'` to `packages/extension-compiler/tsdown.config.ts` `entry`. Add `"./dedupe": {"types": "./dist/dedupe-extensions.d.ts", "import": "./dist/dedupe-extensions.js"}` to `packages/extension-compiler/package.json` `exports`.

- [ ] **Step 9: Run tests + build + typecheck + lint**

```bash
pnpm turbo run build --filter=@conciv/extension-compiler
pnpm --filter @conciv/extension-compiler exec vitest run
pnpm --filter @conciv/extension-compiler typecheck && (cd packages/extension-compiler && npx oxlint)
```
Expected: all PASS/clean; `dist/dedupe-extensions.js` emitted.

- [ ] **Step 10: Commit**

```bash
git add packages/extension-compiler/src/dedupe-extensions.ts packages/extension-compiler/src/extension-guard.ts packages/extension-compiler/src/extensions.ts packages/extension-compiler/tsdown.config.ts packages/extension-compiler/package.json packages/extension-compiler/test/dedupe-extensions.test.ts packages/extension-compiler/test/load-server-extensions.test.ts
git commit -m "feat(extension-compiler): provenance dedup/validation, Dirent file matching, .d.ts exclusion, fatal missing-default"
```

---

## Task 4: Resolution matrix — packed fixtures proving every condition path

Dedicated task (codex M9). Proves, with executable fixtures, that the conditional exports resolve correctly across Node/jiti, Vite, and TypeScript.

**Files:**
- Create: `packages/extensions/tanstack/test/resolution-matrix.it.test.ts` (drives real resolvers against a packed install + the workspace)

**Interfaces:** Consumes the packed `@conciv/extension-tanstack`.

- [ ] **Step 1: Write the failing matrix test**

Assert, from a packed install fixture: (a) Node (`import.meta.resolve` default conditions) → `dist/server.js`; (b) Vite client resolve (spin a real `vite` `createServer`, `resolveId('@conciv/extension-tanstack', importer, {ssr:false})`) → `dist/client.js`; (c) Vite ssr resolve (`{ssr:true}`) → `dist/server.js`; (d) `tsc --traceResolution` (or the TS API) WITHOUT `customConditions` → `server.d.ts`, and WITH `customConditions:["browser"]` → `client.d.ts`. Each assertion checks the resolved absolute path suffix. (Workspace client→`src/client.tsx` is proven by the Task 7 Vite e2e; keep this task on the packed artifacts.)

- [ ] **Step 2: Run to verify it fails, then confirm it passes after Task 1's map**

```bash
pnpm turbo run build --filter=@conciv/extension-tanstack
pnpm --filter @conciv/extension-tanstack exec vitest run test/resolution-matrix.it.test.ts
```
Expected: with Task 1's map in place, PASS; if a cell fails, adjust the export map and re-run before proceeding.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/tanstack/test/resolution-matrix.it.test.ts
git commit -m "test(extension-tanstack): resolution matrix across node/vite-client/vite-ssr/typescript"
```

---

## Task 5: Next.js client discovery via literal `import.meta.glob` (register() stays sole engine owner)

Requires Task 0 = GO.

**Files:** Modify `packages/plugin/src/nextjs-widget.ts`. Reference `packages/plugin/src/core/nextjs.ts` (do NOT add a webpack plugin).

**Interfaces:** Consumes `dedupeExtensions` (`@conciv/extension-compiler/dedupe`), `mountConciv` (`@conciv/embed`).

- [ ] **Step 1: Rewrite `nextjs-widget.ts` (literal glob, typed guard, no `as`)**

```ts
/// <reference lib="dom" />
import {mountConciv} from '@conciv/embed'
import {dedupeExtensions} from '@conciv/extension-compiler/dedupe'

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

function startWidget(): void {
  window.__CONCIV_API_BASE__ = `http://127.0.0.1:${port}`
  const mods = import.meta.glob('/conciv/extensions/*.{ts,tsx,js,jsx}', {eager: true})
  const entries = Object.entries(mods)
    .filter(([key]) => !key.endsWith('.d.ts'))
    .map(([source, mod]) => ({extension: mod && typeof mod === 'object' && 'default' in mod ? mod.default : undefined, source}))
  const picked = dedupeExtensions(entries)
  for (const drop of picked.dropped) console.warn('conciv extension dropped:', drop.source, drop.reason)
  mountConciv(picked.extensions)
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

- [ ] **Step 2: Verify register() is the only engine boot; no webpack plugin added**

Read `packages/plugin/src/core/nextjs.ts` — `register()` uses `makeEngineBooter(..., NO_BUILTINS)`. Confirm `withConciv` adds no `unplugin.webpack`. No change beyond verification.

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @conciv/plugin typecheck && (cd packages/plugin && npx oxlint)
```
Expected: clean (no `as`).

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/nextjs-widget.ts
git commit -m "feat(plugin): Next.js loads folder client extensions via literal import.meta.glob (Turbopack)"
```

---

## Task 6: Next.js version boundary — peer ranges + app pins

**Files:** Modify `packages/plugin/package.json`, `packages/it/package.json` (peer), `e2e/nextjs/package.json`, `e2e/nextjs-component/package.json`, `apps/examples/nextjs-app/package.json` (pins).

- [ ] **Step 1: Raise the Next peer range (bounded)**

Change the Next peer in `@conciv/plugin` and `@conciv/it` from `^15.3.0 || ^16.0.0` to `>=16.3.0 <17` (folder discovery needs Turbopack 16.3; bounded per codex L-17). If 16.3 is not GA at implementation time, record the decision in the Task 0 finding and gate.

- [ ] **Step 2: Bump every Next consumer pin + install**

Set `next` to `^16.3.0` in `e2e/nextjs`, `e2e/nextjs-component`, `apps/examples/nextjs-app`; `pnpm install`.

- [ ] **Step 3: Verify a Next app builds**

```bash
pnpm install && cd e2e/nextjs && pnpm exec next build 2>&1 | tail -5
```
Expected: install resolves; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/package.json packages/it/package.json e2e/nextjs/package.json e2e/nextjs-component/package.json apps/examples/nextjs-app/package.json pnpm-lock.yaml
git commit -m "chore(nextjs): require Next >=16.3 <17 (Turbopack import.meta.glob) for folder discovery"
```

---

## Task 7: e2e — both halves proven on Vite + packed Next.js/Turbopack

**Files:** Modify `e2e/tanstack-start/*`, `e2e/nextjs/*`; create a packed-fixture harness under `e2e/nextjs/`.

**Interfaces:** Consumes packed `@conciv/*` + the reference extension; uses `@conciv/extension-testkit` `callTool` for the server-half proof.

- [ ] **Step 1: Vite — client half (red first)**

Add `@conciv/extension-tanstack: workspace:*` to `e2e/tanstack-start/package.json`; create `e2e/tanstack-start/conciv/extensions/tanstack.tsx` = `export {default} from '@conciv/extension-tanstack'`; `pnpm install`. Inspect the running widget to find the real DOM surface that lists an installed extension, then add a red Playwright test in `e2e/tanstack-start/tests/widget.spec.ts` asserting the tanstack client card/label is visible via a native locator (no test-ids). Run it and confirm it FAILS before the extension is wired, PASSES after.

- [ ] **Step 2: Server half — non-vacuous, via the real engine `callTool`**

Add an integration test (Node, real engine) using `@conciv/extension-testkit`'s host + `callTool` (the same path the tanstack server tests already use) against an app whose `conciv/extensions/` contains the re-export: assert `callTool('tanstack_router_state', {...})` returns a real result (proves `loadServerExtensions` loaded `server.js` and the engine registered the tool). This is a testkit IT in the owning package or `e2e` harness — NOT a client DOM assertion.
```bash
pnpm --filter @conciv/extension-tanstack exec vitest run   # if the IT lives with the extension
cd e2e/tanstack-start && CONCIV_E2E=1 pnpm exec playwright test
```
Expected: server IT + client Playwright both PASS.

- [ ] **Step 3: Packed Next.js/Turbopack fixture (concrete pack + install + nested root)**

In `e2e/nextjs`, add a script/fixture that: builds + `pnpm pack`s the closed local set (as Task 0 Step 1), creates a temp **nested-monorepo** fixture, installs the tarballs (no `workspace:*`), drops `conciv/extensions/tanstack.tsx`, runs `next dev` (Turbopack), and — via Playwright — asserts the tanstack client card renders. Then an add/remove/rename HMR assertion. Then `next build`.
```bash
cd e2e/nextjs && CONCIV_E2E=1 pnpm exec playwright test
```
Expected: PASS on Turbopack, packed install.

- [ ] **Step 4: Concrete client-graph assertion (no text-grep)**

After `next build`, read the Turbopack build manifest / module trace (identify the exact JSON that records resolved module paths for the widget entry) and assert the packed extension's `dist/client.js` appears in the client graph and `dist/server.js` + any `node:` builtin do NOT. If the manifest does not expose resolved paths, add a test-only client sentinel export in the reference extension's client entry and a distinct server sentinel, and assert the client sentinel string is present in the widget's client chunk and the server sentinel is absent — scoped to chunks reachable from the widget entry.

- [ ] **Step 5: Commit**

```bash
git add e2e/tanstack-start e2e/nextjs pnpm-lock.yaml
git commit -m "test(e2e): folder-installed extension proves both halves on Vite + packed Next.js/Turbopack"
```

---

## Task 8: Docs — install a first-party extension

**Files:** Create `apps/site/content/docs/extensions/install-first-party.mdx` (path per the docs IA — inspect `apps/site/content/docs` first); modify the docs nav/meta.

- [ ] **Step 1: Write the guide**

Cover: `pnpm add @conciv/extension-<name>`; the one-line `conciv/extensions/<name>.tsx` re-export; that both halves wire via conditional exports + `import.meta.glob`; supported frameworks incl. **Next.js on Turbopack (≥16.3)** and that `--webpack` is unsupported; that built-ins need no install; that stub files are `.ts/.tsx/.js/.jsx` (not `.d.ts`). Author section: publish the Task 1 conditional-export map; the TS caveat (`customConditions:["browser"]` needed for browser-context editor types).

- [ ] **Step 2: Build the docs site**

```bash
pnpm turbo run build --filter=site 2>&1 | tail -5
```
Expected: builds; the page is in nav.

- [ ] **Step 3: Commit**

```bash
git add apps/site/content/docs
git commit -m "docs(site): install a first-party extension (folder re-export, all frameworks)"
```

---

## Task 9: File follow-up issues

- [ ] **Step 1: CLI issue**

```bash
gh issue create --title "conciv extensions add <name> — shadcn-style CLI to install first-party extensions" --body "Resolve name->package; install with the detected package manager; scaffold conciv/extensions/<name>.tsx; respect config; idempotent; list/remove later. Depends on spec 2026-07-22-first-party-extension-install-design.md. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 2: Deferred-scope issues**

`gh issue create` for (a) baked builtins on Next.js (today `NO_BUILTINS`), (b) legacy `next dev --webpack` folder-install.

- [ ] **Step 3: Link issue numbers in the spec follow-ups + commit**

```bash
git add docs/superpowers/specs/2026-07-22-first-party-extension-install-design.md
git commit -m "docs(spec): link filed follow-up issues (CLI, next builtins, webpack)"
```

---

## Final gates (serialize against code-editing agents)

- [ ] `pnpm typecheck && pnpm build && pnpm lint`
- [ ] `pnpm turbo run test --force` (real failures = 0)
- [ ] `pnpm exec fallow audit --changed-since main --format json` — fix INTRODUCED
- [ ] `pnpm turbo run publint attw --filter='@conciv/extension-*' --filter=@conciv/plugin --filter=@conciv/extension-compiler`
- [ ] A changeset naming the 5 published extensions + plugin + extension-compiler (conditional exports = public-API change)
- [ ] Full e2e green in CI (Vite + Next.js/Turbopack)

## Self-review (spec coverage)
- Split (conditional exports) → Tasks 1, 2 (incl. recorder). Resolution paths → Task 4 (packed matrix) + Task 7. Server-discovery build-first + provenance/dedup/fatal → Task 3. Client discovery: Vite (Task 3 generator) + Next literal glob (Task 5). Turbopack go/no-go → Task 0 (2×2, closed dep set, final graph). Peer ranges → Task 6. Both-halves cross-bundler e2e, server via `callTool`, client via manifest/sentinel → Task 7. Docs → Task 8. CLI + deferred → Task 9. Non-goals (unplugin/registry/config-option/webpack-legacy) not built.
