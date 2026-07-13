# Src Exports for the Browser Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip 12 browser-side packages to src `exports` in the workspace (published tarballs stay dist-only via `publishConfig.exports`), so editing them in dev needs zero rebuilds.

**Architecture:** The oRPC pattern: dev `exports` point at `./src/*.ts(x)`, `publishConfig.exports` carries today's dist map and pnpm rewrites the manifest at pack time (spike-proven: `pnpm pack`, publint, and changesets' `pnpm publish` all apply it; attw does NOT — it packs with npm, so attw moves to a pnpm-packed tarball). In dev the HOST app's vite serves the src; the conciv plugin's existing `transformConcivModule` pipeline gains a self-describing matcher (nearest `package.json` name is `conciv` or starts with `@conciv/`) that routes our src TSX through the existing `compileExtensionSolid` babel pass. No name registry anywhere.

**Tech Stack:** pnpm + turbo, vite, babel-preset-solid (existing), @changesets/cli 2.31 (unchanged), publint/attw, vitest, citty.

**Spec:** `docs/superpowers/specs/2026-07-13-src-exports-project-b-design.md` (S1 + S2 PASS with results inline; S3 css-artifact caveat accepted; embed/extensions `./client`/uno-preset excluded, see Out of scope there).

## Global Constraints

- Functions, not classes. Zero code comments in TS/JS. No IIFEs. No `any`/`as`/non-null `!`. No `else` (early returns).
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Build/typecheck via turbo only (`pnpm turbo run build --filter=<pkg>`), never hand-rebuild dist.
- Commit after every task with pathspec: `git commit -m "..." -- <paths>`.
- Do NOT run `pnpm release` or `release:version` — CI-only.
- Published tarballs must be byte-equivalent in RESOLUTION to today: every flip task asserts the packed manifest's `exports` equal the pre-flip dist map.
- The solid dedupe set (`concivSolidConfig` in `packages/extension-compiler/src/vite-plumbing.ts`) is untouched by this plan.
- `packages/embed`, `packages/extensions/*` `./client` exports, and `@conciv/uno-preset` are OUT OF SCOPE (embed needs the S3 uno-pipeline decision first; uno-preset is node-build-time).
- Package builds keep existing behavior — dist is still built for publish and for embed's global bundle; only dev RESOLUTION changes.
- If a local dev server was running against an example app during this work, its `node_modules/.vite` prebundle is stale after an export-map flip (504 Outdated Optimize Dep). Fix: `rm -rf apps/examples/*/node_modules/.vite apps/*/node_modules/.vite`. Never kill dev servers with bare `lsof` (use `-sTCP:LISTEN`).

---

### Task 1: Self-describing src-TSX matcher in `@conciv/extension-compiler`

**Files:**

- Create: `packages/extension-compiler/src/conciv-src.ts`
- Create: `packages/extension-compiler/test/fixtures/conciv-src/scoped/package.json`, `.../scoped/src/button.tsx`, `.../app/package.json`, `.../app/src/entry.tsx`, `.../other/package.json`, `.../other/src/button.tsx`
- Modify: `packages/extension-compiler/src/vite-plumbing.ts`
- Test: `packages/extension-compiler/test/conciv-src.it.test.ts`

**Interfaces:**

- Produces: `isConcivSrcTsx(id: string): boolean` exported from `packages/extension-compiler/src/conciv-src.ts`, and a new branch in `transformConcivModule` (vite-plumbing) that solid-compiles matching modules. Tasks 4–7 rely on this branch existing; nothing else consumes the function directly.

- [ ] **Step 1: Create fixtures**

`packages/extension-compiler/test/fixtures/conciv-src/scoped/package.json`:

```json
{"name": "@conciv/fixture-ui", "type": "module"}
```

`packages/extension-compiler/test/fixtures/conciv-src/scoped/src/button.tsx`:

```tsx
export const Button = () => <button>ok</button>
```

`packages/extension-compiler/test/fixtures/conciv-src/app/package.json`:

```json
{"name": "conciv", "type": "module"}
```

`packages/extension-compiler/test/fixtures/conciv-src/app/src/entry.tsx`:

```tsx
export const Entry = () => <div>app</div>
```

`packages/extension-compiler/test/fixtures/conciv-src/other/package.json`:

```json
{"name": "some-host-lib", "type": "module"}
```

`packages/extension-compiler/test/fixtures/conciv-src/other/src/button.tsx`:

```tsx
export const Button = () => <button>host</button>
```

- [ ] **Step 2: Write the failing test**

`packages/extension-compiler/test/conciv-src.it.test.ts` (the vitest config only picks up `test/**/*.it.test.ts` and excludes `test/fixtures/**`):

```ts
import {describe, expect, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {isConcivSrcTsx} from '../src/conciv-src.js'
import {transformConcivModule} from '../src/vite-plumbing.js'

const fixture = (rel: string) => fileURLToPath(new URL(`./fixtures/conciv-src/${rel}`, import.meta.url))

describe('isConcivSrcTsx', () => {
  it('matches src tsx inside an @conciv-scoped package', () => {
    expect(isConcivSrcTsx(fixture('scoped/src/button.tsx'))).toBe(true)
  })

  it('matches src tsx inside the package named conciv', () => {
    expect(isConcivSrcTsx(fixture('app/src/entry.tsx'))).toBe(true)
  })

  it('rejects src tsx belonging to a host package', () => {
    expect(isConcivSrcTsx(fixture('other/src/button.tsx'))).toBe(false)
  })

  it('rejects non-tsx and non-src ids', () => {
    expect(isConcivSrcTsx(fixture('scoped/src/button.tsx').replace('.tsx', '.ts'))).toBe(false)
    expect(isConcivSrcTsx(fixture('scoped/package.json'))).toBe(false)
  })

  it('ignores vite query suffixes', () => {
    expect(isConcivSrcTsx(`${fixture('scoped/src/button.tsx')}?v=abc123`)).toBe(true)
  })

  it('rejects anything under node_modules', () => {
    expect(isConcivSrcTsx(`/repo/node_modules/@conciv/x/src/a.tsx`)).toBe(false)
  })
})

describe('transformConcivModule routing', () => {
  it('solid-compiles conciv src tsx', async () => {
    const id = fixture('scoped/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>ok</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code).toContain('_$template')
  })

  it('leaves host src tsx alone (falls through to jsx source stamping)', async () => {
    const id = fixture('other/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>host</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code ?? '').not.toContain('_$template')
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension-compiler`
Expected: FAIL — `Cannot find module '../src/conciv-src.js'`.

- [ ] **Step 4: Implement the matcher**

`packages/extension-compiler/src/conciv-src.ts`:

```ts
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const nameCache = new Map<string, string | null>()

function manifestName(path: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
      return parsed.name
    }
    return null
  } catch {
    return null
  }
}

function packageNameFor(dir: string): string | null {
  const cached = nameCache.get(dir)
  if (cached !== undefined) return cached
  const own = manifestName(join(dir, 'package.json'))
  const parent = dirname(dir)
  const resolved = own ?? (parent === dir ? null : packageNameFor(parent))
  nameCache.set(dir, resolved)
  return resolved
}

const isConcivName = (name: string) => name === 'conciv' || name.startsWith('@conciv/')

export function isConcivSrcTsx(id: string): boolean {
  const file = id.split('?')[0] ?? id
  if (!file.endsWith('.tsx')) return false
  if (!/[\\/]src[\\/]/.test(file)) return false
  if (file.includes('node_modules')) return false
  const name = packageNameFor(dirname(file))
  return name !== null && isConcivName(name)
}
```

- [ ] **Step 5: Wire into `transformConcivModule`**

In `packages/extension-compiler/src/vite-plumbing.ts` add the import and the branch (the branch sits after the node_modules bail, before the extension-module branch):

```ts
import {isConcivSrcTsx} from './conciv-src.js'
```

```ts
if (id.includes('node_modules')) return null
if (isConcivSrcTsx(id)) return compileExtensionSolid(code, id, ssr)
if (isExtensionModule(id))
  return splitExtension(code, id, 'browser').then((split) => compileExtensionSolid(split?.code ?? code, id, ssr))
```

- [ ] **Step 6: Run test, verify it passes**

Run: `pnpm turbo run build --filter=@conciv/extension-compiler && pnpm turbo run test --filter=@conciv/extension-compiler`
Expected: PASS (all pre-existing extension-compiler ITs stay green — the new branch is dormant for every id that isn't conciv src TSX).

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-compiler`
Expected: PASS.

```bash
git commit -m "feat(extension-compiler): solid-compile @conciv src tsx in host vite" -- packages/extension-compiler
```

---

### Task 2: `conciv-publish attw` — attw over a pnpm-packed tarball

attw's `--pack` shells out to `npm pack`, which does not apply pnpm's `publishConfig.exports` rewrite, so it false-fails on every flipped package (spike S1). This subcommand packs with pnpm and hands attw the tarball.

**Files:**

- Modify: `packages/publish/src/cli.ts`
- Test: `packages/publish/test/attw.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: CLI `conciv-publish attw [...attwFlags]` runnable from any package dir. Tasks 4–7 set package scripts to `conciv-publish attw --profile esm-only ...`.

- [ ] **Step 1: Write the failing test**

`packages/publish/test/attw.test.ts` (real pack + real attw on `@conciv/grab`, a small already-publishable package; attw+pack take a few seconds, so one generous test timeout sized to the real operation):

```ts
import {test, expect} from 'vitest'
import {execa} from 'execa'
import {fileURLToPath} from 'node:url'

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const grabDir = fileURLToPath(new URL('../../grab', import.meta.url))

test('attw subcommand packs with pnpm and passes flags through', {timeout: 120_000}, async () => {
  const result = await execa('node', [cli, 'attw', '--profile', 'esm-only'], {cwd: grabDir, reject: false})
  expect(result.exitCode, result.stderr + result.stdout).toBe(0)
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm turbo run test --filter=@conciv/publish`
Expected: FAIL — citty reports unknown command `attw` (non-zero exit).

- [ ] **Step 3: Implement the subcommand**

In `packages/publish/src/cli.ts` add imports and the command, and register it in `subCommands`:

```ts
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
```

```ts
const attw = defineCommand({
  meta: {name: 'attw', description: 'Run attw against a pnpm-packed tarball (applies publishConfig overrides)'},
  async run({rawArgs}) {
    const dir = await mkdtemp(join(tmpdir(), 'conciv-attw-'))
    const tarball = join(dir, 'package.tgz')
    try {
      await execa('pnpm', ['pack', '--out', tarball], {cwd: process.cwd(), stdio: 'inherit'})
      await execa('pnpm', ['exec', 'attw', tarball, ...rawArgs], {cwd: process.cwd(), stdio: 'inherit'})
    } finally {
      await rm(dir, {recursive: true, force: true})
    }
  },
})
```

In `main`:

```ts
  subCommands: {version, check, release, snapshot, attw},
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm turbo run test --filter=@conciv/publish`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm turbo run typecheck --filter=@conciv/publish`
Expected: PASS.

```bash
git commit -m "feat(publish): attw subcommand packing via pnpm" -- packages/publish
```

---

### Task 3: Unify tsconfig strictness where consumers will compile dep src

Consumers apply their OWN compiler flags to dep src (spike S6): the example app's solid extensions tsconfig and the site lack `noUncheckedIndexedAccess`, which the repo base sets. Without this, flips produce phantom TS2367-style errors (and hide real ones).

**Files:**

- Modify: `apps/examples/tanstack-start/conciv/extensions/tsconfig.json`
- Modify: `apps/site/tsconfig.json`
- Modify: `apps/site/src/components/VariableProximity.tsx:22-23`
- Modify: `apps/site/src/lib/source.ts:16`

**Interfaces:**

- Consumes/Produces: nothing programmatic; tasks 4–7's `pnpm typecheck` gate depends on this landing first.

- [ ] **Step 1: Add the flag to both tsconfigs**

In `apps/examples/tanstack-start/conciv/extensions/tsconfig.json` `compilerOptions`, after `"strict": true`:

```json
    "noUncheckedIndexedAccess": true,
```

Same addition in `apps/site/tsconfig.json` `compilerOptions`.

- [ ] **Step 2: Run typecheck, verify the two known site errors appear**

Run: `pnpm turbo run typecheck --filter=site --filter=tanstack-start-example`
Expected: FAIL with exactly TS2345 at `src/components/VariableProximity.tsx(23)` and TS2532 at `src/lib/source.ts(16)`. The example app passes (verified during planning).

- [ ] **Step 3: Fix the two site errors**

`apps/site/src/components/VariableProximity.tsx` — destructured `split(' ')` elements are now `string | undefined`; default them (parseFloat('') is NaN, same behavior as before for malformed input):

```ts
const [name = '', axisValue = ''] = part.split(' ')
return [name.replace(/['"]/g, ''), Number.parseFloat(axisValue)] as const
```

`apps/site/src/lib/source.ts` — indexed read is now possibly undefined; the `segs.length === 0` guard above makes it non-empty, narrow with `??`:

```ts
out[out.length - 1] = (out[out.length - 1] ?? '').replace(/\.md$/, '')
```

- [ ] **Step 4: Run typecheck, verify it passes**

Run: `pnpm turbo run typecheck --filter=site --filter=tanstack-start-example`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: noUncheckedIndexedAccess in site + example extensions tsconfigs" -- apps/site apps/examples/tanstack-start/conciv/extensions/tsconfig.json
```

---

### Task 4: Pilot flip — `@conciv/ui-kit-system`

First real flip, with the full verification battery: unit/IT suites, embed global-bundle rebuild (it now compiles ui-kit src during `vite build`), packed-manifest assertion, publint/attw, and a live dev-server proof that the host vite serves solid-compiled src.

**Files:**

- Modify: `packages/ui-kit-system/package.json`

**Interfaces:**

- Consumes: Task 1's compile branch (dev serving), Task 2's `conciv-publish attw` (script), Task 3's tsconfigs (typecheck gate).
- Produces: the manifest shape every later flip copies.

- [ ] **Step 1: Flip the manifest**

In `packages/ui-kit-system/package.json`, replace the `exports` and `publishConfig` blocks (dist map moves verbatim under `publishConfig.exports`; `access: public` stays):

```json
  "exports": {
    ".": "./src/index.tsx",
    "./tokens": "./src/tokens.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./tokens": {
        "types": "./dist/tokens.d.ts",
        "import": "./dist/tokens.js"
      },
      "./tokens.css": "./src/tokens.css"
    }
  },
```

And swap the attw script:

```json
    "attw": "conciv-publish attw --profile esm-only --exclude-entrypoints tokens.css"
```

`@conciv/publish` must be reachable from the package for the script: add to `devDependencies`:

```json
    "@conciv/publish": "workspace:*",
```

Run `pnpm install` after editing (updates the lockfile link).

- [ ] **Step 2: Assert the packed manifest still resolves to dist**

```bash
cd packages/ui-kit-system
pnpm pack --out /tmp/ui-kit-system-flip.tgz
mkdir -p /tmp/ui-kit-system-flip && tar xzf /tmp/ui-kit-system-flip.tgz -C /tmp/ui-kit-system-flip
node -e "const e=require('/tmp/ui-kit-system-flip/package/package.json').exports; const ok=e['.'].import==='./dist/index.js'&&e['./tokens'].import==='./dist/tokens.js'; if(!ok){console.error(JSON.stringify(e,null,2));process.exit(1)}; console.log('tarball exports OK')"
```

Expected: `tarball exports OK`.

- [ ] **Step 3: Rebuild + run the affected suites**

```bash
pnpm turbo run build --filter=@conciv/embed
pnpm turbo run test --filter=@conciv/ui-kit-system --filter=@conciv/embed --filter=@conciv/extension-compiler
pnpm typecheck
```

Expected: all PASS. The embed build now pulls `ui-kit-system/src/*.tsx` through embed's own vite-plugin-solid; if the global-bundle build errors on a ui-kit tsx file, that plugin's include/exclude is filtering out-of-package files — fix there, not with a prebuild.

- [ ] **Step 4: publint + attw**

```bash
pnpm turbo run publint attw --filter=@conciv/ui-kit-system
```

Expected: both PASS (publint packs via pnpm natively; attw now goes through Task 2's subcommand).

- [ ] **Step 5: Live dev proof**

```bash
rm -rf apps/examples/tanstack-start/node_modules/.vite
cd apps/examples/tanstack-start && pnpm exec vite dev --port 4199 --strictPort &
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:4199/ && break; sleep 1; done
curl -s "http://localhost:4199/@fs$(cd ../../.. && pwd)/packages/ui-kit-system/src/button.tsx" | grep -c '_\$template'
kill $(lsof -ti tcp:4199 -sTCP:LISTEN)
```

Expected: grep prints a non-zero count (solid-compiled output served from src, no package rebuild involved).

- [ ] **Step 6: Full test run**

Run: `pnpm test`
Expected: PASS (widget ITs load the freshly rebuilt global bundle from Step 3).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(ui-kit-system): src exports in dev, dist via publishConfig" -- packages/ui-kit-system/package.json pnpm-lock.yaml
```

---

### Task 5: Flip the remaining ui-kits

Same shape as Task 4 for `ui-kit-chat`, `ui-kit-chat-tools`, `ui-kit-tap`, `ui-kit-terminal`. All entries are `src/index.tsx` (verified during planning).

**Files:**

- Modify: `packages/ui-kit-chat/package.json`, `packages/ui-kit-chat-tools/package.json`, `packages/ui-kit-tap/package.json`, `packages/ui-kit-terminal/package.json`

**Interfaces:**

- Consumes: Tasks 1–3; the manifest shape from Task 4.
- Produces: nothing new downstream.

- [ ] **Step 1: Flip all four manifests**

`packages/ui-kit-chat/package.json` (css subpaths already point at src and stay in BOTH maps):

```json
  "exports": {
    ".": "./src/index.tsx",
    "./theme/tokens.css": "./src/theme/tokens.css",
    "./theme/conciv.css": "./src/theme/conciv.css"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./theme/tokens.css": "./src/theme/tokens.css",
      "./theme/conciv.css": "./src/theme/conciv.css"
    }
  },
```

attw script: `"attw": "conciv-publish attw --profile esm-only --exclude-entrypoints theme/tokens.css theme/conciv.css"`

`packages/ui-kit-chat-tools/package.json`, `packages/ui-kit-tap/package.json`, `packages/ui-kit-terminal/package.json` (identical shape):

```json
  "exports": {
    ".": "./src/index.tsx"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
```

attw script for all three: `"attw": "conciv-publish attw --profile esm-only"`

All four: add `"@conciv/publish": "workspace:*"` to `devDependencies` (keep alphabetical order), keep every existing `publishConfig` key that is already there (`access` shown above; copy any others verbatim). Run `pnpm install`.

- [ ] **Step 2: Assert packed manifests**

```bash
for p in ui-kit-chat ui-kit-chat-tools ui-kit-tap ui-kit-terminal; do
  (cd packages/$p && pnpm pack --out /tmp/$p.tgz >/dev/null && mkdir -p /tmp/$p && tar xzf /tmp/$p.tgz -C /tmp/$p && node -e "const e=require('/tmp/$p/package/package.json').exports; if(e['.'].import!=='./dist/index.js'){console.error('$p BAD',JSON.stringify(e));process.exit(1)}; console.log('$p OK')")
done
```

Expected: four `OK` lines.

- [ ] **Step 3: Rebuild, gates**

```bash
pnpm turbo run build --filter=@conciv/embed
pnpm typecheck
pnpm turbo run publint attw --filter=@conciv/ui-kit-chat --filter=@conciv/ui-kit-chat-tools --filter=@conciv/ui-kit-tap --filter=@conciv/ui-kit-terminal
pnpm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ui-kits): src exports in dev, dist via publishConfig" -- packages/ui-kit-chat/package.json packages/ui-kit-chat-tools/package.json packages/ui-kit-tap/package.json packages/ui-kit-terminal/package.json pnpm-lock.yaml
```

---

### Task 6: Flip the solid leaf libraries

`solid-diffs` and `solid-streamdown` (entries `src/index.tsx`) and `mascot` (entry `src/rig.ts` — plain TS, esbuild handles it in dev; the matcher is irrelevant for it, only resolution changes).

**Files:**

- Modify: `packages/solid-diffs/package.json`, `packages/solid-streamdown/package.json`, `packages/mascot/package.json`

**Interfaces:**

- Consumes: Tasks 1–4 shape.
- Produces: nothing new downstream.

- [ ] **Step 1: Flip the manifests**

`packages/solid-diffs/package.json`:

```json
  "exports": {
    ".": "./src/index.tsx"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
```

attw: `"attw": "conciv-publish attw --profile esm-only"`

`packages/solid-streamdown/package.json`:

```json
  "exports": {
    ".": "./src/index.tsx",
    "./styles.css": "./src/styles.css"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./styles.css": "./src/styles.css"
    }
  },
```

attw: `"attw": "conciv-publish attw --profile esm-only --exclude-entrypoints styles.css"`

NOTE: if `packages/solid-streamdown/src/index.tsx` turns out to be `index.ts` at execution time, use the actual filename (verified as `.tsx` during planning).

`packages/mascot/package.json`:

```json
  "exports": {
    ".": "./src/rig.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/rig.d.ts",
        "import": "./dist/rig.js"
      }
    }
  },
```

attw: `"attw": "conciv-publish attw --profile esm-only"`

All three: `"@conciv/publish": "workspace:*"` in `devDependencies`, preserve existing `publishConfig` keys, `pnpm install`.

- [ ] **Step 2: Assert packed manifests**

```bash
for p in solid-diffs solid-streamdown mascot; do
  (cd packages/$p && pnpm pack --out /tmp/$p.tgz >/dev/null && mkdir -p /tmp/$p && tar xzf /tmp/$p.tgz -C /tmp/$p && node -e "const e=require('/tmp/$p/package/package.json').exports; if(!e['.'].import.startsWith('./dist/')){console.error('$p BAD',JSON.stringify(e));process.exit(1)}; console.log('$p OK')")
done
```

Expected: three `OK` lines.

- [ ] **Step 3: Rebuild, gates**

```bash
pnpm turbo run build --filter=@conciv/embed
pnpm typecheck
pnpm turbo run publint attw --filter=@conciv/solid-diffs --filter=@conciv/solid-streamdown --filter=@conciv/mascot
pnpm test
```

Expected: all PASS. The site consumes mascot; Task 3's site tsconfig flag is what keeps `pnpm typecheck` green here.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(solid-libs): src exports in dev, dist via publishConfig" -- packages/solid-diffs/package.json packages/solid-streamdown/package.json packages/mascot/package.json pnpm-lock.yaml
```

---

### Task 7: Flip the plain-TS data layer

`client`, `grab`, `storage-history` (public) and `page` (private — exports flip only, no publishConfig, no attw). All plain `.ts` — no solid compile involved; dev vite handles TS natively. The only node-side references to these are `import type` (erased), verified during planning.

**Files:**

- Modify: `packages/client/package.json`, `packages/grab/package.json`, `packages/storage-history/package.json`, `packages/page/package.json`

**Interfaces:**

- Consumes: Task 2 (attw script), Task 4 shape.
- Produces: nothing new downstream.

- [ ] **Step 1: Flip the manifests**

`packages/client/package.json`:

```json
  "exports": {
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
```

`packages/grab/package.json`:

```json
  "exports": {
    ".": "./src/grab.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/grab.d.ts",
        "import": "./dist/grab.js"
      }
    }
  },
```

`packages/storage-history/package.json`:

```json
  "exports": {
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
```

attw for these three: `"attw": "conciv-publish attw --profile esm-only"`, plus `"@conciv/publish": "workspace:*"` in `devDependencies`.

`packages/page/package.json` (private — exports swap only):

```json
  "exports": {
    ".": "./src/index.ts"
  },
```

Run `pnpm install`.

- [ ] **Step 2: Assert packed manifests (public three)**

```bash
for p in client grab storage-history; do
  (cd packages/$p && pnpm pack --out /tmp/$p.tgz >/dev/null && mkdir -p /tmp/$p && tar xzf /tmp/$p.tgz -C /tmp/$p && node -e "const e=require('/tmp/$p/package/package.json').exports; if(!e['.'].import.startsWith('./dist/')){console.error('$p BAD',JSON.stringify(e));process.exit(1)}; console.log('$p OK')")
done
```

Expected: three `OK` lines.

- [ ] **Step 3: Rebuild, gates**

```bash
pnpm turbo run build --filter=@conciv/embed
pnpm typecheck
pnpm turbo run publint attw --filter=@conciv/client --filter=@conciv/grab --filter=@conciv/storage-history
pnpm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(data-layer): src exports in dev, dist via publishConfig" -- packages/client/package.json packages/grab/package.json packages/storage-history/package.json packages/page/package.json pnpm-lock.yaml
```

---

### Task 8: Final gates, changeset, docs

**Files:**

- Create: `.changeset/src-exports-browser-set.md`
- Modify: `AGENTS.md` (Toolchain dev-loop bullet), `docs/superpowers/specs/2026-07-13-src-exports-project-b-design.md` (status line)

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. If `conciv-src.ts` shows an unused-export finding for `isConcivSrcTsx`, verify with `pnpm exec fallow dead-code --trace 'packages/extension-compiler/src/conciv-src.ts:isConcivSrcTsx'` — it is consumed by `vite-plumbing.ts`; a "USED but file unreachable" verdict means a missing entry point in the package's build config, not dead code.

- [ ] **Step 2: Full gate**

Run: `pnpm typecheck && pnpm build && pnpm test && pnpm format:check`
Expected: all PASS.

- [ ] **Step 3: Changeset**

`.changeset/src-exports-browser-set.md` (fixed versioning: one entry naming one package bumps the whole `@conciv/*` set):

```markdown
---
'@conciv/ui-kit-system': patch
---

Workspace dev resolution now serves browser-set packages from src; published tarballs unchanged (dist via publishConfig.exports).
```

- [ ] **Step 4: Update AGENTS.md dev-loop bullet**

In `AGENTS.md` Toolchain section, replace:

```markdown
- Dev loop (`pnpm dev`): widget/UI edits only need a browser hard reload; edits to core, harness, or
  tool packages need the dev server restarted — a reload alone runs stale server code.
```

with:

```markdown
- Dev loop (`pnpm dev`): ui-kit/solid-lib/data-layer packages (src exports) hot-serve from source —
  edit and reload, no rebuild. `@conciv/embed` itself and node-side packages (core, harness, tools,
  plugin) still resolve dist: rebuild embed for widget-shell edits, restart the dev server for
  server-side edits. After changing any package's `exports` map, `rm -rf <app>/node_modules/.vite`
  or vite 504s with "Outdated Optimize Dep". NEW UnoCSS utility classes added in ui-kit src need an
  embed rebuild to appear (css is generated at embed build).
```

- [ ] **Step 5: Update the spec status line**

In `docs/superpowers/specs/2026-07-13-src-exports-project-b-design.md`, replace the `**Status:**` lines with:

```markdown
**Status:** implemented for the 12-package browser set (plan
`docs/superpowers/plans/2026-07-13-src-exports-browser-set.md`). Still open: S3 (uno pipeline →
embed src flip), extensions `./client` exports, cold-start measurement (S4).
```

- [ ] **Step 6: Commit**

```bash
git commit -m "docs: src-exports rollout notes + changeset" -- .changeset/src-exports-browser-set.md AGENTS.md docs/superpowers/specs/2026-07-13-src-exports-project-b-design.md
```
