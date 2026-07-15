# Grounded Live Driving on conciv.dev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor's connected agent resolves any grabbed element on conciv.dev to real source in its workspace: the deployed site carries `data-conciv-source` annotations and the connector seeds its throwaway workspace with the site's source from a build-time manifest.

**Architecture:** Three site/connect-local pieces, no core/widget/page changes. (1) A site-local vite plugin (`apply: 'build'`, `enforce: 'pre'`) stamps `data-conciv-source` into the prod build via the existing `addSourceToJsx` transform. (2) The site build packs `src/**` text files into a `public/site-source.json` manifest (path→content map). (3) `@conciv/connect` downloads that manifest on pair, writes the files plus a grounding `AGENTS.md` into the throwaway workspace before `start()`.

**Tech Stack:** `@conciv/extension-compiler/inject-source` (`addSourceToJsx(code, id, root)`), vite plugin hooks, node `fs`, existing `@conciv/connect` + site e2e harness.

**Spec:** `docs/superpowers/specs/2026-07-15-site-grounded-live-driving-design.md` — read it first.

**Branch note:** work continues on `live-widget-connect` (worktree `.claude/worktrees/live-widget-connect`), on top of the shipped connect flow.

## Global Constraints

- Repo style: functions not classes, zero code comments (lint deletes them), no semicolons, single quotes, no `any`/`as`/non-null `!`, no IIFEs, no barrel files, no abbreviations in identifiers.
- TDD: red test first. Real browser (Playwright) only for UI; `environment: 'node'` pinned in vitest configs (site config already has it).
- Build via turbo only (`pnpm turbo run build --filter=<pkg>`). Site package name is `site`.
- Commit after each task with explicit pathspec (`git commit -- <paths>`). NEVER push.
- No new external npm deps. Workspace `@conciv/*` deps are fine.
- Manifest asset path is exactly `/site-source.json`. Manifest shape is exactly `Record<string, string>` (repo-relative path → file content), text files only.
- Seeding only touches throwaway workspaces: `--workspace .` never gets seeded or overwritten.
- Validate manifest paths before writing (reject absolute paths and `..` segments).
- The prek hook can abort with a `next-index-*.lock.lock` race on large commits: recover with `pnpm format` then `git commit --no-verify`.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.

---

### Task 1: Site build annotations (`data-conciv-source` in prod)

**Files:**

- Create: `apps/site/src/lib/source-annotations.ts`
- Modify: `apps/site/vite.config.ts` (register plugin)
- Modify: `apps/site/package.json` (devDep `@conciv/extension-compiler`)
- Test: `apps/site/test/source-annotations.test.ts`

**Interfaces:**

- Consumes: `addSourceToJsx(code: string, id: string, root: string): {code: string; map: SourceMap} | null` from `@conciv/extension-compiler/inject-source` (returns null for non-jsx/tsx files or when nothing changed).
- Produces: `annotateSiteFile(code: string, id: string, root: string): {code: string; map: unknown} | null` (null unless `id` is under `<root>/src/`), and `sourceAnnotations(root: string): Plugin` (vite plugin, `apply: 'build'`, `enforce: 'pre'`).

- [x] **Step 1: Write the failing test**

`apps/site/test/source-annotations.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {annotateSiteFile} from '../src/lib/source-annotations'

const ROOT = '/repo/apps/site'
const FIXTURE = 'export function Hero() {\n  return <h1 className="od-display">hi</h1>\n}\n'

describe('annotateSiteFile', () => {
  it('stamps data-conciv-source with a root-relative path', () => {
    const out = annotateSiteFile(FIXTURE, `${ROOT}/src/components/landing/hero.tsx`, ROOT)
    expect(out?.code).toContain('data-conciv-source="src/components/landing/hero.tsx:2:10"')
  })

  it('ignores files outside src/', () => {
    const out = annotateSiteFile(FIXTURE, `${ROOT}/node_modules/pkg/thing.tsx`, ROOT)
    expect(out).toBeNull()
  })

  it('ignores non-jsx files', () => {
    const out = annotateSiteFile('export const x = 1\n', `${ROOT}/src/lib/pair-text.ts`, ROOT)
    expect(out).toBeNull()
  })
})
```

(Column value: `addSourceToJsx` reports the JSX opening-element position 1-based. If the exact `:2:10` assertion fails on the real offset, read the actual output once and pin the real number — the shape `src/components/landing/hero.tsx:<line>:<col>` is the contract, not the specific digits. `addSourceToJsx` re-reads the file from disk for positions when it can (`diskPositions`); for a non-existent fixture path it falls back to in-memory positions, which is what this test exercises.)

- [x] **Step 2: Run it, verify fail**

Run: `cd apps/site && pnpm vitest run test/source-annotations.test.ts`
Expected: FAIL — module `../src/lib/source-annotations` not found.

- [x] **Step 3: Implement**

`apps/site/src/lib/source-annotations.ts`:

```ts
import {addSourceToJsx} from '@conciv/extension-compiler/inject-source'
import type {Plugin} from 'vite'

export function annotateSiteFile(code: string, id: string, root: string): ReturnType<typeof addSourceToJsx> {
  const file = id.split('?')[0] ?? id
  if (!file.startsWith(`${root}/src/`)) return null
  return addSourceToJsx(code, file, root)
}

export function sourceAnnotations(root: string): Plugin {
  return {
    name: 'site-source-annotations',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      return annotateSiteFile(code, id, root)
    },
  }
}
```

`apps/site/package.json` devDependencies: add `"@conciv/extension-compiler": "workspace:*"`, then `pnpm install`.

`apps/site/vite.config.ts`: add to imports

```ts
import {sourceAnnotations} from './src/lib/source-annotations'
```

and register FIRST in the plugins array (before `dropWasmFromServerBundle()`), so it sees original TSX before the react/router plugins compile it:

```ts
plugins: [
  sourceAnnotations(import.meta.dirname),
  dropWasmFromServerBundle(),
  ...
]
```

- [x] **Step 4: Run test, verify pass**

Run: `cd apps/site && pnpm vitest run test/source-annotations.test.ts`
Expected: 3 passing.

- [x] **Step 5: Verify annotations reach the built site**

```bash
pnpm turbo run build --filter=site --force
grep -c 'data-conciv-source' apps/site/dist/client/assets/*.js | grep -v ':0' | head -3
```

Expected: at least one chunk with matches. Also check the prerendered HTML: `grep -c 'data-conciv-source' apps/site/dist/client/index.html` (prerender inlines the hero markup; if the count is 0 there but chunks match, that is fine — hydration stamps the DOM).

- [x] **Step 6: Typecheck + commit**

```bash
pnpm turbo run typecheck lint --filter=site
git add apps/site/src/lib/source-annotations.ts apps/site/vite.config.ts apps/site/package.json apps/site/test/source-annotations.test.ts pnpm-lock.yaml
git commit -m "feat(site): stamp data-conciv-source into the prod build" -- apps/site pnpm-lock.yaml
```

---

### Task 2: Source manifest asset (`/site-source.json`)

**Files:**

- Create: `apps/site/scripts/build-source-manifest.mjs`
- Modify: `apps/site/package.json` (wire into `build` script)
- Modify: `apps/site/.gitignore` (ignore the generated asset)
- Test: `apps/site/test/source-manifest.test.ts`

**Interfaces:**

- Consumes: `apps/site/src/**` on disk.
- Produces: `buildManifest(siteDir: string): Record<string, string>` exported from the script (keys are site-relative posix paths like `src/components/landing/hero.tsx`, plus `package.json`); the script when run directly writes `public/site-source.json`.

- [x] **Step 1: Write the failing test**

`apps/site/test/source-manifest.test.ts`:

```ts
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {buildManifest} from '../scripts/build-source-manifest.mjs'

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url))

describe('buildManifest', () => {
  it('collects site source files keyed by relative path', () => {
    const manifest = buildManifest(SITE_DIR)
    expect(manifest['src/components/landing/hero.tsx']).toContain('function Hero')
    expect(manifest['src/lib/pair-text.ts']).toContain('npx @conciv/connect')
    expect(manifest['package.json']).toContain('"name": "site"')
  })

  it('holds only text files and no path escapes', () => {
    const manifest = buildManifest(SITE_DIR)
    const paths = Object.keys(manifest)
    expect(paths.every((p) => !p.startsWith('/') && !p.split('/').includes('..'))).toBe(true)
    expect(paths.some((p) => /\.(png|jpg|woff2?|wasm)$/.test(p))).toBe(false)
  })
})
```

- [x] **Step 2: Run it, verify fail**

Run: `cd apps/site && pnpm vitest run test/source-manifest.test.ts`
Expected: FAIL — script module not found.

- [x] **Step 3: Implement**

`apps/site/scripts/build-source-manifest.mjs`:

```js
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const TEXT_EXTENSIONS = ['.ts', '.tsx', '.css', '.md', '.mdx', '.json', '.txt', '.svg']

function isTextFile(path) {
  return TEXT_EXTENSIONS.some((extension) => path.endsWith(extension))
}

function collectFiles(dir) {
  return readdirSync(dir, {withFileTypes: true, recursive: true})
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

export function buildManifest(siteDir) {
  const sourceDir = join(siteDir, 'src')
  const files = collectFiles(sourceDir).filter(isTextFile)
  const entries = files.map((file) => [relative(siteDir, file).split('\\').join('/'), readFileSync(file, 'utf8')])
  entries.push(['package.json', readFileSync(join(siteDir, 'package.json'), 'utf8')])
  return Object.fromEntries(entries)
}

const executedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (executedDirectly) {
  const siteDir = fileURLToPath(new URL('..', import.meta.url))
  mkdirSync(join(siteDir, 'public'), {recursive: true})
  writeFileSync(join(siteDir, 'public', 'site-source.json'), JSON.stringify(buildManifest(siteDir)))
}
```

`apps/site/package.json` build script becomes:

```json
"build": "node scripts/copy-widget-bundle.mjs && node scripts/build-source-manifest.mjs && vite build",
```

`apps/site/.gitignore`: under the widget-bundle line add

```
/public/site-source.json
```

- [x] **Step 4: Run tests + build, verify asset**

```bash
cd apps/site && pnpm vitest run test/source-manifest.test.ts
cd ../.. && pnpm turbo run build --filter=site --force
node -e "const m = require('./apps/site/public/site-source.json'); console.log(Object.keys(m).length, 'files'); if (!m['src/components/landing/hero.tsx']) process.exit(1)"
```

Expected: tests pass; asset exists with the hero file inside.

- [x] **Step 5: Commit**

```bash
git add apps/site/scripts/build-source-manifest.mjs apps/site/package.json apps/site/.gitignore apps/site/test/source-manifest.test.ts
git commit -m "feat(site): build-time source manifest asset /site-source.json" -- apps/site
```

---

### Task 3: Connector workspace seeding (`@conciv/connect`)

**Files:**

- Create: `packages/connect/src/seed-workspace.ts`
- Modify: `packages/connect/src/connect.ts` (seed before `start()`)
- Modify: `packages/connect/tsdown.config.ts` (nothing to add — `seed-workspace.ts` is imported by `connect.ts`, tsdown bundles it; touch only if the build complains)
- Test: `packages/connect/test/seed-workspace.it.test.ts`

**Interfaces:**

- Consumes: `GET <origin>/site-source.json` → `Record<string, string>` (Task 2's asset).
- Produces: `seedWorkspace(origin: string, root: string): Promise<boolean>` (true = seeded; false = fetch/parse failed, workspace left untouched). On success also writes `<root>/AGENTS.md`. `runConnect` calls it for throwaway workspaces only and logs the outcome.

- [x] **Step 1: Write the failing test**

`packages/connect/test/seed-workspace.it.test.ts`:

```ts
import {createServer, type Server} from 'node:http'
import {existsSync, mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, describe, expect, it} from 'vitest'
import {seedWorkspace} from '../src/seed-workspace.js'

const servers: Server[] = []

function serveManifest(body: string, status = 200): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === '/site-source.json') {
      response.writeHead(status, {'content-type': 'application/json'})
      response.end(body)
      return
    }
    response.writeHead(404)
    response.end()
  })
  servers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '')
    })
  })
}

afterAll(() => {
  servers.forEach((server) => server.close())
})

describe('seedWorkspace', () => {
  it('writes manifest files and AGENTS.md into the workspace', async () => {
    const origin = await serveManifest(
      JSON.stringify({'src/components/landing/hero.tsx': 'export function Hero() {}\n', 'package.json': '{}\n'}),
    )
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(true)
    expect(readFileSync(join(root, 'src/components/landing/hero.tsx'), 'utf8')).toContain('Hero')
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('data-conciv-source')
  })

  it('rejects escaping paths and keeps the rest', async () => {
    const origin = await serveManifest(
      JSON.stringify({'../evil.txt': 'nope', '/abs.txt': 'nope', 'src/ok.ts': 'export const ok = 1\n'}),
    )
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(true)
    expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
    expect(existsSync(join(root, 'abs.txt'))).toBe(false)
  })

  it('returns false and writes nothing when the manifest is missing', async () => {
    const origin = await serveManifest('not found', 404)
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(false)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })
})
```

- [x] **Step 2: Run it, verify fail**

Run: `cd packages/connect && pnpm vitest run test/seed-workspace.it.test.ts`
Expected: FAIL — `../src/seed-workspace.js` does not exist.

- [x] **Step 3: Implement**

`packages/connect/src/seed-workspace.ts`:

```ts
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const AGENTS_TEXT = [
  '# This workspace',
  '',
  'This workspace contains the source of the page you are connected to: the conciv.dev landing',
  'page (`apps/site` of the conciv repo, `src/**` plus `package.json`).',
  '',
  '- Grabbed elements carry a `data-conciv-source="<file>:<line>:<col>"` attribute that maps',
  '  straight to these files. Read the file before explaining or changing anything.',
  '- File edits here are a local sandbox. Nothing redeploys and the live page does not rebuild.',
  '- Use the page tools for live visual changes, and show a diff of these files when the user',
  '  asks you to change something for real.',
  '',
].join('\n')

function safeRelativePath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) return false
  const segments = path.split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

export async function seedWorkspace(origin: string, root: string): Promise<boolean> {
  let manifest: Record<string, string>
  try {
    const response = await fetch(`${origin}/site-source.json`)
    if (!response.ok) return false
    manifest = await response.json()
  } catch {
    return false
  }
  const entries = Object.entries(manifest).filter(
    ([path, content]) => safeRelativePath(path) && typeof content === 'string',
  )
  for (const [path, content] of entries) {
    const target = join(root, path)
    mkdirSync(dirname(target), {recursive: true})
    writeFileSync(target, content)
  }
  writeFileSync(join(root, 'AGENTS.md'), AGENTS_TEXT)
  return true
}
```

(`response.json()` returns `unknown`-ish `any` under some TS configs; if the assignment to `Record<string, string>` fails typecheck, validate instead: assign to `const parsed: unknown = await response.json()`, guard with `typeof parsed === 'object' && parsed !== null`, and build entries from `Object.entries(parsed)` filtering values by `typeof content === 'string'` — never use `as`.)

In `packages/connect/src/connect.ts`, seeding runs for throwaway workspaces only. Change `runConnect`:

```ts
import {seedWorkspace} from './seed-workspace.js'
```

and inside `runConnect`, after resolving `root` and `log`, before the port loop:

```ts
const throwaway = opts.workspace !== '.'
if (throwaway) {
  const origin = opts.origin ?? DEFAULT_ORIGIN
  const seeded = await seedWorkspace(origin, root)
  log(seeded ? 'workspace seeded with the landing-page source' : 'no source manifest found — continuing unseeded')
}
```

- [x] **Step 4: Run tests, verify pass**

Run: `cd packages/connect && pnpm vitest run`
Expected: seed tests 3 passing, existing connect tests still 3 passing (they hit `--origin`-less defaults? No: they pass `harnessAdapter` with no `origin`, so seeding fetches `https://conciv.dev/site-source.json`; today that 404s and degrades, but tests must not depend on the network. Add `origin: 'http://127.0.0.1:1'` to the three existing `runConnect` calls in `connect.it.test.ts` so seeding fails fast locally — the connection-refused path returns false immediately.)

- [x] **Step 5: Typecheck, lint, build, commit**

```bash
pnpm turbo run build typecheck lint --filter=@conciv/connect
git add packages/connect/src/seed-workspace.ts packages/connect/src/connect.ts packages/connect/test/seed-workspace.it.test.ts packages/connect/test/connect.it.test.ts
git commit -m "feat(connect): seed throwaway workspace from /site-source.json + AGENTS.md" -- packages/connect
```

---

### Task 4: E2E grounding assertion + full gate

**Files:**

- Modify: `apps/site/test/live-connect.it.test.ts` (assert grab grounding end to end)

**Interfaces:**

- Consumes: built site with annotations (Task 1) + manifest (Task 2), seeding connector (Task 3), `engine.cfg.stateRoot` (the seeded workspace) from `@conciv/core/start`'s `Engine`.

- [x] **Step 1: Extend the e2e test**

In `apps/site/test/live-connect.it.test.ts`, add imports:

```ts
import {existsSync} from 'node:fs'
import {join} from 'node:path'
```

and inside the existing `it('pairs, mounts the widget and completes a chat turn')`, after the connected-chip poll passes (before opening the chat), add:

```ts
const stamped = page.locator('[data-conciv-source]').first()
const sourceRef = (await stamped.getAttribute('data-conciv-source')) ?? ''
const sourceFile = sourceRef.split(':').slice(0, -2).join(':')
expect(sourceFile).toMatch(/^src\//)
expect(engine).not.toBeNull()
if (engine) expect(existsSync(join(engine.cfg.stateRoot, sourceFile))).toBe(true)
```

This proves the full grounding chain on the deployed artifact: the served DOM carries an annotation, and the exact file it names exists in the connector's seeded workspace.

- [x] **Step 2: Run the e2e**

```bash
pnpm turbo run build --filter=site --force
cd apps/site && pnpm vitest run test/live-connect.it.test.ts
```

Expected: PASS. If `locator('[data-conciv-source]')` finds nothing: check Task 1 Step 5 again on this exact build (stale dist is the usual cause — rebuild with `--force`).

- [x] **Step 3: Full gate**

```bash
pnpm typecheck && pnpm turbo run test --filter=site --filter=@conciv/connect --force
pnpm exec fallow audit --changed-since main --format json
```

Fix anything INTRODUCED. Known pre-existing failures that are NOT yours: core `claude-image` IT, `conciv` app lint (`panel.$sessionId.tsx`), `turn-detach` flake under parallel load.

- [x] **Step 4: Commit**

```bash
git add apps/site/test/live-connect.it.test.ts
git commit -m "test(site): e2e — grabbed element grounds to a seeded workspace file" -- apps/site
```

---

## Deferred (do not build now)

- General prod-annotation feature in `@conciv/it` (site-local until a second consumer).
- `?core=` power-user override, page-reset chip.
- HMR/redeploy of visitor edits; binary assets in the manifest.
