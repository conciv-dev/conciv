# Publish Consolidation Implementation Plan (Project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the npm surface from 27 packages to 3 (`@conciv/it`, `@conciv/extension`, `@conciv/extension-testkit`) by bundling internal packages at the publish boundary, leaving the 30-package workspace and dev loop unchanged.

**Architecture:** Every published package gets a second, publish-mode build (`build:publish` turbo task) that inlines all `@conciv/*` workspace code except a shared singleton set (`@conciv/extension` + its new `ui-*` subpaths, solid-js, @ark-ui/solid, @tanstack/solid-router). Dev builds and exports stay exactly as they are today. Guards in `@conciv/publish` keep the published dependency lists and the public set honest. A packed-install smoke test proves the tarballs work standalone.

**Tech Stack:** pnpm + turbo, tsdown (rolldown), vite, changesets, publint/attw, vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-publish-consolidation-design.md` (all spikes resolved).

## Global Constraints

- Functions, not classes. Zero code comments in TS/JS. No IIFEs. No `any`/`as`/non-null `!`.
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Build/typecheck via turbo only (`pnpm turbo run build --filter=<pkg>`), never hand-rebuild dist.
- Commit after every task with pathspec: `git commit -m "..." -- <paths>`.
- Dedupe set (never inlined anywhere): `solid-js`, `solid-js/web`, `solid-js/store`, `@tanstack/solid-router`, `@ark-ui/solid`, `@conciv/extension` (all subpaths).
- Shared-UI mapping (publish builds only): `@conciv/ui-kit-system` → `@conciv/extension/ui-system`, `@conciv/ui-kit-chat` → `@conciv/extension/ui-chat`, `@conciv/ui-kit-chat-tools` → `@conciv/extension/ui-chat-tools`, `@conciv/ui-kit-terminal` → `@conciv/extension/ui-terminal` (prefix match, so `/tokens`-style subpaths map too).
- Dev-mode resolution must be byte-identical to today after every task: `pnpm typecheck && pnpm build && pnpm test` green before each commit.
- Do NOT run `pnpm release` or `release:version` — CI-only.
- Before finishing the whole plan: `pnpm exec fallow audit --changed-since main --format json`, fix INTRODUCED findings.

---

### Task 1: `@conciv/extension` ui subpath re-exports (dev mode)

**Files:**

- Create: `packages/extension/src/ui-system.ts`, `packages/extension/src/ui-chat.ts`, `packages/extension/src/ui-chat-tools.ts`, `packages/extension/src/ui-terminal.ts`
- Modify: `packages/extension/package.json` (exports, deps), `packages/extension/tsdown.config.ts` (entries)
- Test: `packages/extension/test/ui-subpaths.test.ts`

**Interfaces:**

- Produces: `@conciv/extension/ui-system|ui-chat|ui-chat-tools|ui-terminal` subpath exports, each re-exporting the full surface of the matching ui-kit package. Later tasks (4, 5, 7) externalize these specifiers.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'

describe('extension ui subpaths', () => {
  it('re-exports ui-kit-system through ./ui-system', async () => {
    const direct = await import('@conciv/ui-kit-system')
    const viaExtension = await import('@conciv/extension/ui-system')
    expect(Object.keys(viaExtension)).toEqual(expect.arrayContaining(Object.keys(direct)))
  })

  it('re-exports ui-kit-chat through ./ui-chat', async () => {
    const direct = await import('@conciv/ui-kit-chat')
    const viaExtension = await import('@conciv/extension/ui-chat')
    expect(Object.keys(viaExtension)).toEqual(expect.arrayContaining(Object.keys(direct)))
  })
})
```

Note: this test imports solid packages — check `packages/extension/vitest.config.ts` pins `test: {environment: 'node'}` (Global Constraints for Solid packages). If the import chain fails under plain node because of `.tsx` internals, assert on the built dist instead, mirroring `packages/embed/test/mount-externals.test.ts`'s readFileSync approach.

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: FAIL — `@conciv/extension/ui-system` not exported.

- [ ] **Step 3: Add re-export sources**

`packages/extension/src/ui-system.ts`:

```ts
export * from '@conciv/ui-kit-system'
```

Same pattern for the other three files (`ui-chat.ts` → `@conciv/ui-kit-chat`, `ui-chat-tools.ts` → `@conciv/ui-kit-chat-tools`, `ui-terminal.ts` → `@conciv/ui-kit-terminal`).

- [ ] **Step 4: Wire package.json and tsdown**

In `packages/extension/package.json` add to `dependencies` (workspace deps so dev resolution works):

```json
"@conciv/ui-kit-chat": "workspace:^",
"@conciv/ui-kit-chat-tools": "workspace:^",
"@conciv/ui-kit-terminal": "workspace:^"
```

(`@conciv/ui-kit-system` is already a dep.) Add to `exports`:

```json
"./ui-system": {"types": "./dist/ui-system.d.ts", "import": "./dist/ui-system.js"},
"./ui-chat": {"types": "./dist/ui-chat.d.ts", "import": "./dist/ui-chat.js"},
"./ui-chat-tools": {"types": "./dist/ui-chat-tools.d.ts", "import": "./dist/ui-chat-tools.js"},
"./ui-terminal": {"types": "./dist/ui-terminal.d.ts", "import": "./dist/ui-terminal.js"}
```

In `packages/extension/tsdown.config.ts` add the four new files to `entry`. Confirm the config externalizes `@conciv/*` (dev builds must keep re-exports as pass-throughs); if it has no `external` for them, add `external: [/^@conciv\//]`.

- [ ] **Step 5: Build, test, verify pass**

Run: `pnpm turbo run build --filter=@conciv/extension && pnpm turbo run test --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 6: Full gates + commit**

Run: `pnpm typecheck && pnpm turbo run test --filter=@conciv/extension...`
Expected: green.

```bash
git add packages/extension
git commit -m "feat(extension): ui-kit subpath re-exports for shared singleton surface" -- packages/extension
```

---

### Task 2: shared publish-build helpers in `@conciv/publish`

**Files:**

- Create: `packages/publish/src/bundling.ts`
- Test: `packages/publish/test/bundling.test.ts` (create `test/` dir if missing; check `packages/publish/package.json` has a `test` script — add `"test": "vitest run"` + vitest devDep matching sibling packages if absent)

**Interfaces:**

- Produces:
  - `SHARED_UI: Record<string, string>` — the ui-kit → extension-subpath mapping.
  - `sharedUiRedirect(): {name: string, resolveId(id: string): {id: string, external: true} | null}` — rollup/rolldown/vite plugin redirecting shared-UI imports (prefix-aware) to `@conciv/extension/ui-*` and marking them external.
  - `DEDUPE_EXTERNALS: (string | RegExp)[]` — the never-inline set for publish builds.
- Consumed by: Tasks 3, 4, 5 (publish build configs).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {sharedUiRedirect, DEDUPE_EXTERNALS} from '../src/bundling.ts'

describe('sharedUiRedirect', () => {
  const plugin = sharedUiRedirect()

  it('redirects bare ui-kit imports to extension subpaths as external', () => {
    expect(plugin.resolveId('@conciv/ui-kit-chat')).toEqual({id: '@conciv/extension/ui-chat', external: true})
  })

  it('redirects ui-kit subpath imports preserving the tail', () => {
    expect(plugin.resolveId('@conciv/ui-kit-system/tokens')).toEqual({
      id: '@conciv/extension/ui-system/tokens',
      external: true,
    })
  })

  it('does not touch inlineable conciv imports', () => {
    expect(plugin.resolveId('@conciv/protocol')).toBeNull()
  })

  it('keeps the dedupe set external', () => {
    const hits = (id: string) =>
      DEDUPE_EXTERNALS.some((entry) => (typeof entry === 'string' ? entry === id : entry.test(id)))
    expect(hits('solid-js')).toBe(true)
    expect(hits('solid-js/web')).toBe(true)
    expect(hits('@ark-ui/solid')).toBe(true)
    expect(hits('@tanstack/solid-router')).toBe(true)
    expect(hits('@conciv/extension')).toBe(true)
    expect(hits('@conciv/extension/ui-chat')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm turbo run test --filter=@conciv/publish`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/publish/src/bundling.ts`**

```ts
export const SHARED_UI: Record<string, string> = {
  '@conciv/ui-kit-system': '@conciv/extension/ui-system',
  '@conciv/ui-kit-chat': '@conciv/extension/ui-chat',
  '@conciv/ui-kit-chat-tools': '@conciv/extension/ui-chat-tools',
  '@conciv/ui-kit-terminal': '@conciv/extension/ui-terminal',
}

export const DEDUPE_EXTERNALS: (string | RegExp)[] = [
  'solid-js',
  /^solid-js\//,
  '@ark-ui/solid',
  /^@ark-ui\/solid\//,
  '@tanstack/solid-router',
  '@conciv/extension',
  /^@conciv\/extension\//,
]

export function sharedUiRedirect() {
  return {
    name: 'conciv-shared-ui-redirect',
    resolveId(id: string): {id: string; external: true} | null {
      const hit = Object.entries(SHARED_UI).find(([source]) => id === source || id.startsWith(`${source}/`))
      if (!hit) return null
      const [source, target] = hit
      return {id: `${target}${id.slice(source.length)}`, external: true}
    },
  }
}
```

- [ ] **Step 4: Run test, verify pass, commit**

Run: `pnpm turbo run test --filter=@conciv/publish`
Expected: PASS.

```bash
git add packages/publish
git commit -m "feat(publish): shared bundling helpers for publish-mode builds" -- packages/publish
```

---

### Task 3: `@conciv/extension` publish build (inline internals + ui-kits)

**Files:**

- Create: `packages/extension/tsdown.publish.config.ts`
- Modify: `packages/extension/package.json` (`build:publish` script, peerDependencies, devDep on `@conciv/publish`)
- Modify: `turbo.json` (add `build:publish` task)
- Test: `packages/extension/test/publish-dist.test.ts`

**Interfaces:**

- Consumes: `DEDUPE_EXTERNALS` from Task 2 (import from `@conciv/publish/bundling` — add that subpath export to `packages/publish/package.json` if its export map doesn't already expose `./bundling`; the package is private so a plain `"./bundling": "./src/bundling.ts"` source export is fine for config-file consumption via tsdown's config loader).
- Produces: `dist/` for `@conciv/extension` where every chunk contains no `@conciv/*` import except `@conciv/extension/*` self-references; ui subpath chunks contain the full ui-kit code.

- [ ] **Step 1: Add turbo task**

In `turbo.json` `tasks`, add:

```json
"build:publish": {
  "dependsOn": ["build", "^build"],
  "outputs": ["dist/**", "dist-publish/**"]
}
```

- [ ] **Step 2: Write the failing test**

```ts
import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const chunks = () => readdirSync(distDir).filter((name) => name.endsWith('.js'))
const read = (name: string) => readFileSync(`${distDir}/${name}`, 'utf8')

describe('extension publish dist', () => {
  it('contains no imports of unpublished conciv packages', () => {
    const offenders = chunks().flatMap((name) => {
      const source = read(name)
      const imports = [...source.matchAll(/from\s*["'](@conciv\/[^"']+)["']/g)].map((m) => m[1] ?? '')
      return imports.filter((spec) => !spec.startsWith('@conciv/extension')).map((spec) => `${name}: ${spec}`)
    })
    expect(offenders).toEqual([])
  })

  it('ui-chat chunk carries the ui-kit code instead of re-exporting it', () => {
    expect(read('ui-chat.js')).not.toMatch(/from\s*["']@conciv\/ui-kit-chat["']/)
  })
})
```

Guard the test so it only runs when the publish dist was built (dev dist would legitimately fail it): `build:publish` writes a marker file `dist/.publish-build` (see Step 3's `onSuccess`), and the suite skips when it is absent:

```ts
import {existsSync} from 'node:fs'
const publishBuilt = existsSync(`${distDir}/.publish-build`)
describe.skipIf(!publishBuilt)('extension publish dist', () => { ... })
```

- [ ] **Step 3: Create `packages/extension/tsdown.publish.config.ts`**

Copy the entry list from `packages/extension/tsdown.config.ts` (index + catalog + the four ui files from Task 1), then:

```ts
import {writeFileSync} from 'node:fs'
import {defineConfig} from 'tsdown'
import {DEDUPE_EXTERNALS} from '@conciv/publish/bundling'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/catalog.ts',
    'src/ui-system.ts',
    'src/ui-chat.ts',
    'src/ui-chat-tools.ts',
    'src/ui-terminal.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^solid-js(\/|$)/, /^@ark-ui\/solid(\/|$)/, '@tanstack/solid-router'],
  noExternal: [/^@conciv\//],
  onSuccess() {
    writeFileSync('dist/.publish-build', '')
  },
})
```

The `@conciv/extension` entries of `DEDUPE_EXTERNALS` are deliberately absent here: this IS that package, and its own source never imports itself, so listing only the solid/ark/router singletons avoids any external-vs-noExternal precedence question.

The ui-kit sources are `.tsx` (solid). tsdown compiles them only if the solid plugin is present — check how `packages/extensions/terminal` handles solid in tsdown (memory: `unplugin-solid` in tsdown). If the ui-kits' code fails to compile through this package's tsdown, switch this publish build to a `vite.publish.config.ts` lib build with `vite-plugin-solid` (mirror `packages/embed/vite.config.ts`, multi-entry `build.lib.entry`), keeping the same external/noExternal semantics. Either tool is acceptable; the dist test is the contract.

- [ ] **Step 4: Wire scripts and manifest**

`packages/extension/package.json`:

```json
"scripts": {"build:publish": "tsdown --config tsdown.publish.config.ts"},
"peerDependencies": {"solid-js": "^1.9.13", "@ark-ui/solid": "<copy the version range ui-kit-system declares>"},
"devDependencies": {"@conciv/publish": "workspace:*"}
```

Move the four ui-kit deps added in Task 1 plus `@conciv/contract`, `@conciv/grab`, `@conciv/protocol`, `@conciv/ui-kit-system` from `dependencies` to `devDependencies` (they inline at publish; dev resolution still works via workspace). Third-party runtime deps that remain imports in the dist (`@orpc/client`, `@orpc/server`, `@tanstack/ai`, `hono`, `zod` — plus whatever the ui-kits' dists import; enumerate with the Step 5 grep) stay/land in `dependencies`.

- [ ] **Step 5: Build publish dist, run test**

Run: `pnpm turbo run build:publish --filter=@conciv/extension && pnpm turbo run test --filter=@conciv/extension`
Expected: PASS. Then enumerate real third-party imports to finalize `dependencies`:

Run: `grep -rhoE "from ['\"][^.@][^'\"]*|from ['\"]@[a-z-]+/[^'\"]*" packages/extension/dist/*.js | sort -u`
Update `dependencies` to exactly that list (minus the dedupe set, which is peers).

- [ ] **Step 6: publint + attw against publish dist, commit**

Run: `pnpm turbo run build:publish --filter=@conciv/extension && (cd packages/extension && pnpm publint && pnpm attw)`
Expected: both pass.

```bash
git add packages/extension turbo.json
git commit -m "feat(extension): publish-mode build inlining internals and ui-kits" -- packages/extension turbo.json
```

Note: `build:publish` overwrites `dist/` with publish-mode output. Restore dev dist afterwards with `pnpm turbo run build --filter=@conciv/extension --force` and confirm `dist/.publish-build` is gone (add `rm -f dist/.publish-build`-equivalent by having the dev build's `emptyOutDir`/tsdown clean handle it — verify, and if tsdown doesn't clean, delete the marker in the dev build script).

---

### Task 4: embed + first-party extensions publish assets

**Files:**

- Create: `packages/embed/vite.publish.config.ts`
- Create: `packages/extensions/terminal/vite.publish.config.ts`, `packages/extensions/test-runner/vite.publish.config.ts`, `packages/extensions/whiteboard/vite.publish.config.ts`
- Modify: those four `package.json`s (`build:publish` scripts, `@conciv/publish` devDep)
- Modify: `packages/embed/test/mount-externals.test.ts` (publish-artifact assertions)

**Interfaces:**

- Consumes: `sharedUiRedirect`, `DEDUPE_EXTERNALS` from Task 2; `@conciv/extension/ui-*` subpaths from Task 1.
- Produces: `packages/embed/dist-publish/mount.js` (+ css) — widget lib with all `@conciv/*` inlined except `@conciv/extension/*`; `packages/extensions/*/dist-publish/client.js` — extension clients with the same externals contract. Consumed by Task 5's asset copy.

- [ ] **Step 1: Extend mount-externals test (failing)**

Append to `packages/embed/test/mount-externals.test.ts`:

```ts
const publishMountPath = fileURLToPath(new URL('../dist-publish/mount.js', import.meta.url))
const publishBuilt = existsSync(publishMountPath)
const publishMount = publishBuilt ? readFileSync(publishMountPath, 'utf8') : ''
const publishExternalized = (specifier: string) =>
  new RegExp(`from\\s*["']${specifier.replaceAll('/', '\\/')}`).test(publishMount)

describe.skipIf(!publishBuilt)('embed publish mount inlines internals, shares extension singletons', () => {
  it('externalizes only the extension subpaths for shared ui', () => {
    expect(publishExternalized('@conciv/extension/ui-system')).toBe(true)
    expect(publishExternalized('@conciv/ui-kit-system')).toBe(false)
    expect(publishExternalized('@conciv/ui-kit-chat')).toBe(false)
  })

  it('inlines every other conciv package', () => {
    const concivImports = [...publishMount.matchAll(/from\s*["'](@conciv\/[^"']+)["']/g)].map((m) => m[1] ?? '')
    expect(concivImports.filter((spec) => !spec.startsWith('@conciv/extension'))).toEqual([])
  })

  it('still externalizes the solid and ark singletons', () => {
    expect(publishExternalized('solid-js')).toBe(true)
    expect(publishExternalized('@ark-ui/')).toBe(true)
  })
})
```

(Add the `existsSync` import; do not touch the existing dev-dist assertions — that guard stays as-is.)

- [ ] **Step 2: Run test, verify skip-or-fail**

Run: `pnpm turbo run test --filter=@conciv/embed`
Expected: new suite skipped (no dist-publish yet); existing suite green.

- [ ] **Step 3: Create `packages/embed/vite.publish.config.ts`**

```ts
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'
import {DEDUPE_EXTERNALS, sharedUiRedirect} from '@conciv/publish/bundling'

const isDedupeExternal = (id: string): boolean =>
  DEDUPE_EXTERNALS.some((entry) => (typeof entry === 'string' ? entry === id : entry.test(id)))

export default defineConfig({
  plugins: [sharedUiRedirect(), solid()],
  define: {'define.amd': 'false'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/mount.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'mount.js',
    },
    outDir: 'dist-publish',
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {external: isDedupeExternal},
  },
})
```

Add script: `"build:publish": "vite build --config vite.publish.config.ts"`. Keep the existing `build` untouched.

- [ ] **Step 4: Build + test embed publish asset**

Run: `pnpm turbo run build:publish --filter=@conciv/embed && pnpm turbo run test --filter=@conciv/embed`
Expected: publish suite runs and PASSES. If `sharedUiRedirect` doesn't fire because vite's own resolver wins, register it with `enforce: 'pre'` (wrap as `{...sharedUiRedirect(), enforce: 'pre'}`).

- [ ] **Step 5: Extension client publish configs**

For each of terminal/test-runner/whiteboard, create `vite.publish.config.ts` next to the existing `vite.config.ts`, copying it and changing exactly: add `sharedUiRedirect()` before the solid plugin, set `outDir: 'dist-publish'`, and replace the external predicate with `isDedupeExternal` (same helper as embed). Add `"build:publish": "vite build --config vite.publish.config.ts"` to each package.json plus `"@conciv/publish": "workspace:*"` devDep. The whiteboard's `@conciv/ui-kit-tap` and `@conciv/grab` imports inline (they are not in SHARED_UI); its `@conciv/extension` imports stay external via DEDUPE_EXTERNALS.

Add a dist assertion test per extension, e.g. `packages/extensions/terminal/test/publish-dist.test.ts`, same shape as embed's Step 1 suite but reading `../dist-publish/client.js` and asserting: no `@conciv/*` imports except `@conciv/extension*`, solid externalized.

- [ ] **Step 6: Build all, test, commit**

Run: `pnpm turbo run build:publish --filter=@conciv/embed --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard && pnpm turbo run test --filter=@conciv/embed --filter=@conciv/extension-terminal --filter=@conciv/extension-test-runner --filter=@conciv/extension-whiteboard`
Expected: PASS.

```bash
git add packages/embed packages/extensions
git commit -m "feat: publish-mode widget and extension client builds" -- packages/embed packages/extensions
```

---

### Task 5: `@conciv/it` — publish bundle, embedded assets, bin, testkit-runtime

**Files:**

- Create: `packages/it/src/bin.ts`, `packages/it/src/testkit-runtime.ts`, `packages/it/src/resolve-bundled.ts`, `packages/it/tsdown.publish.config.ts`
- Modify: `packages/it/src/plugin-instance.ts`, `packages/it/package.json`, `packages/it/tsdown.config.ts`
- Test: `packages/it/test/publish-dist.test.ts` (create `test/` + vitest config + `"test": "vitest run"` script mirroring `packages/extension`)

**Interfaces:**

- Consumes: Task 4 assets (`packages/embed/dist-publish/*`, `packages/extensions/*/dist-publish/client.js`); `DEDUPE_EXTERNALS` from Task 2.
- Produces:
  - npm `bin` `conciv` → `./dist/bin.js`.
  - Export `@conciv/it/testkit-runtime` re-exporting `start` (and its types) from `@conciv/core/start` — consumed by Task 6.
  - `resolveBundled(specifier: string, relative: string): string` — workspace-resolve-first, fall back to a path inside own dist. Used by `plugin-instance.ts`.
  - Publish dist layout: `dist/*.js` (plugin variants, bin, testkit-runtime), `dist/embed/mount.js` (+ `dist/embed/*.css`, `dist/embed/conciv-widget.global.js`), `dist/extensions/<name>/client.js`.

- [ ] **Step 1: New source files**

`packages/it/src/resolve-bundled.ts`:

```ts
import {fileURLToPath} from 'node:url'

export function resolveBundled(specifier: string, relative: string): string {
  try {
    return fileURLToPath(import.meta.resolve(specifier))
  } catch {
    return fileURLToPath(new URL(relative, import.meta.url))
  }
}
```

`packages/it/src/plugin-instance.ts` becomes:

```ts
import {createConcivUnplugin} from '@conciv/plugin'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import {resolveBundled} from './resolve-bundled.js'

export const unplugin = createConcivUnplugin({
  serverExtensions: [terminal, testRunner, whiteboard],
  clientEntries: [
    resolveBundled('@conciv/extension-terminal/client', './extensions/terminal/client.js'),
    resolveBundled('@conciv/extension-test-runner/client', './extensions/test-runner/client.js'),
    resolveBundled('@conciv/extension-whiteboard/client', './extensions/whiteboard/client.js'),
  ],
  embedEntry: resolveBundled('@conciv/embed', './embed/mount.js'),
})
```

(In the workspace `import.meta.resolve` succeeds → identical behavior to today. In the published tarball those packages are absent → local dist paths.)

`packages/it/src/bin.ts`:

```ts
import '@conciv/cli/bin'
```

`packages/it/src/testkit-runtime.ts`:

```ts
export {start} from '@conciv/core/start'
export type {Engine} from '@conciv/core/start'
```

(Verify the actual exported type names of `@conciv/core/start` — `packages/plugin/src/core/vite.ts:4` imports `type {Engine}`, so `Engine` exists; re-export whatever `start`'s signature needs.)

- [ ] **Step 2: Dev tsdown + manifest wiring**

`packages/it/tsdown.config.ts`: add `'src/bin.ts'` and `'src/testkit-runtime.ts'` to `entry` (externals already cover `@conciv/*`).

`packages/it/package.json`:

- Add `"bin": {"conciv": "./dist/bin.js"}`.
- Add exports: `"./testkit-runtime": {"types": "./dist/testkit-runtime.d.ts", "import": "./dist/testkit-runtime.js"}`.
- Add workspace devDependencies used by the new entries: `"@conciv/cli": "workspace:*"`, `"@conciv/core": "workspace:*"` — as `dependencies` for now (dev resolution); Task 8's dep rewrite settles final placement.

Run: `pnpm turbo run build --filter=@conciv/it && pnpm typecheck`
Expected: green. `node packages/it/dist/bin.js --help` prints the conciv CLI help (same as `pnpm exec conciv --help`).

- [ ] **Step 3: Write the failing publish-dist test**

`packages/it/test/publish-dist.test.ts`:

```ts
import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const publishBuilt = existsSync(`${distDir}/.publish-build`)

describe.skipIf(!publishBuilt)('it publish dist', () => {
  it('ships embed and extension client assets', () => {
    expect(existsSync(`${distDir}/embed/mount.js`)).toBe(true)
    expect(existsSync(`${distDir}/embed/conciv-widget.global.js`)).toBe(true)
    expect(existsSync(`${distDir}/extensions/terminal/client.js`)).toBe(true)
    expect(existsSync(`${distDir}/extensions/test-runner/client.js`)).toBe(true)
    expect(existsSync(`${distDir}/extensions/whiteboard/client.js`)).toBe(true)
  })

  it('node chunks import no unpublished conciv packages', () => {
    const offenders = readdirSync(distDir)
      .filter((name) => name.endsWith('.js'))
      .flatMap((name) => {
        const source = readFileSync(`${distDir}/${name}`, 'utf8')
        const imports = [...source.matchAll(/from\s*["'](@conciv\/[^"']+)["']/g)].map((m) => m[1] ?? '')
        return imports.filter((spec) => !spec.startsWith('@conciv/extension')).map((spec) => `${name}: ${spec}`)
      })
    expect(offenders).toEqual([])
  })
})
```

Run: `pnpm turbo run test --filter=@conciv/it` — Expected: suite skipped (marker absent), run green.

- [ ] **Step 4: Create `packages/it/tsdown.publish.config.ts`**

```ts
import {cpSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'tsdown'
import {DEDUPE_EXTERNALS} from '@conciv/publish/bundling'

const from = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  entry: [
    'src/plugin/vite.ts',
    'src/plugin/webpack.ts',
    'src/plugin/rspack.ts',
    'src/plugin/rollup.ts',
    'src/plugin/esbuild.ts',
    'src/plugin/nextjs.ts',
    'src/plugin/nextjs-widget.ts',
    'src/bin.ts',
    'src/testkit-runtime.ts',
  ],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [...DEDUPE_EXTERNALS, 'unplugin', 'vite', 'launch-editor', 'next'],
  noExternal: [/^@conciv\//],
  onSuccess() {
    cpSync(from('../embed/dist-publish'), from('dist/embed'), {recursive: true})
    cpSync(from('../embed/dist/conciv-widget.global.js'), from('dist/embed/conciv-widget.global.js'))
    cpSync(from('../extensions/terminal/dist-publish/client.js'), from('dist/extensions/terminal/client.js'))
    cpSync(from('../extensions/test-runner/dist-publish/client.js'), from('dist/extensions/test-runner/client.js'))
    cpSync(from('../extensions/whiteboard/dist-publish/client.js'), from('dist/extensions/whiteboard/client.js'))
    writeFileSync(from('dist/.publish-build'), '')
  },
})
```

Script: `"build:publish": "tsdown --config tsdown.publish.config.ts"`. The turbo `build:publish` task's `dependsOn: ["build", "^build"]` does NOT run dependencies' `build:publish`; extend the task definition in `turbo.json` to `"dependsOn": ["build", "^build", "^build:publish"]` so embed/extension assets exist.

Two landmines to check during this step:

1. `noExternal` pulls in node-side workspace code from each package's DIST (their exports point at dist) — dist is plain JS, no solid involved. Good. But `nextjs-widget.ts` imports `@conciv/embed` (browser code): with `noExternal` tsdown would try to inline embed's dist lib — instead REDIRECT it: add a tiny resolveId plugin (same pattern as `sharedUiRedirect`) mapping `@conciv/embed` → `./embed/mount.js` relative import, emitted as external:

```ts
const embedRedirect = () => ({
  name: 'conciv-embed-redirect',
  resolveId: (id: string) => (id === '@conciv/embed' ? {id: './embed/mount.js', external: true} : null),
})
```

Register via tsdown's `plugins: [embedRedirect()]`. 2. Native/heavy deps of core (node-pty, libsql, etc.) must stay external — `noExternal` only matches `@conciv/*`, third-party stays external by default in tsdown when listed in `dependencies`. Step 5's grep + Task 8's guard enforce the final list.

- [ ] **Step 5: Build, enumerate deps, test**

Run: `pnpm turbo run build:publish --filter=@conciv/it && pnpm turbo run test --filter=@conciv/it`
Expected: PASS.

Enumerate third-party imports of the bundle and set `dependencies` exactly:

Run: `grep -rhoE "from ['\"][^.@'\"][^'\"]*|from ['\"]@[a-z0-9-]+/[^'\"]*" packages/it/dist/*.js | sed "s/from ['\"]//" | sort -u`

`dependencies` = that list minus `unplugin`/`vite`/`next` (peers) — plus `"@conciv/extension": "workspace:^"` (real published dep). Everything `@conciv/*` else moves to `devDependencies`.

- [ ] **Step 6: publint/attw, dev-mode regression, commit**

Run: `(cd packages/it && pnpm publint && pnpm attw)`
Expected: pass.

Restore dev dist and prove the dev loop is intact:
Run: `pnpm turbo run build --filter=@conciv/it --force && pnpm test`
Expected: full suite green (widget ITs load prebuilt bundle — rebuild embed first per AGENTS if needed: `pnpm turbo run build --filter=@conciv/embed`).

```bash
git add packages/it turbo.json
git commit -m "feat(it): publish bundle with embedded widget, extension clients, bin, testkit-runtime" -- packages/it turbo.json
```

---

### Task 6: `@conciv/extension-testkit` goes public

**Files:**

- Modify: `packages/extension-testkit/package.json`, `packages/extension-testkit/src/boot-server.ts`
- Create: `packages/extension-testkit/tsdown.publish.config.ts` (or vite, matching its current build tool — inspect its package.json first)
- Test: `packages/extension-testkit/test/publish-dist.test.ts`

**Interfaces:**

- Consumes: `@conciv/it/testkit-runtime` (Task 5).
- Produces: published devDep for extension authors; peers on `@conciv/it` + `@conciv/extension`.

- [ ] **Step 1: Rewire core import**

In `packages/extension-testkit/src/boot-server.ts` change:

```ts
import {start} from '@conciv/core/start'
```

to:

```ts
import {start} from '@conciv/it/testkit-runtime'
```

Add `"@conciv/it": "workspace:^"` to dependencies; drop `"@conciv/core"`.

Run: `pnpm turbo run build --filter=@conciv/extension-testkit && pnpm turbo run test --filter=@conciv/extension-testkit`
Expected: green (identical runtime — dev testkit-runtime chunk re-exports core/start).

- [ ] **Step 2: Manifest flip**

`packages/extension-testkit/package.json`:

- Remove `"private": true`; add `"publishConfig": {"access": "public"}`, `"homepage": "https://conciv.dev"`, `"repository"` block with `"directory": "packages/extension-testkit"` (copy shape from `packages/extension/package.json`).
- `peerDependencies`: `"@conciv/it": "workspace:^"`, `"@conciv/extension": "workspace:^"` (changesets rewrites workspace ranges on publish), plus `vite` if its plumbing requires it at runtime.
- Keep `@conciv/harness-testkit`, `@conciv/extension-compiler`, `@conciv/contract`, `@conciv/grab`, `@conciv/protocol`, `@conciv/ui-kit-system` as devDependencies (inlined at publish).
- Add `publint`/`attw` scripts (copy from `packages/extension`).

- [ ] **Step 3: Publish build**

`tsdown.publish.config.ts` mirroring Task 3's shape: entries = its current build entries, `external: [...DEDUPE_EXTERNALS, /^@conciv\/it(\/|$)/]`, `noExternal: [/^@conciv\//]`, marker file in `onSuccess`. The ui-kit-system import goes through `sharedUiRedirect()` (register in `plugins`) so it lands on `@conciv/extension/ui-system`.

Publish-dist test (same regex harness as Task 3's Step 2): assert no `@conciv/*` imports in dist except `@conciv/it/*` and `@conciv/extension*`.

- [ ] **Step 4: Build, test, gates, commit**

Run: `pnpm turbo run build:publish --filter=@conciv/extension-testkit && pnpm turbo run test --filter=@conciv/extension-testkit && (cd packages/extension-testkit && pnpm publint && pnpm attw)`
Expected: PASS.

```bash
git add packages/extension-testkit
git commit -m "feat(extension-testkit): publish as extension-author devkit" -- packages/extension-testkit
```

---

### Task 7: flip 25 packages private + shrink guards

**Files:**

- Modify: every `packages/*/package.json` and `packages/extensions/*/package.json` except `it`, `extension`, `extension-testkit` (add `"private": true`, remove `publishConfig`, remove `publint`/`attw` scripts)
- Modify: `packages/publish/src/guards.ts`
- Test: existing `packages/publish` tests (extend if a guards test file exists; otherwise add `packages/publish/test/guards.test.ts`)

**Interfaces:**

- Produces: `PUBLIC_PACKAGES = ['@conciv/it', '@conciv/extension', '@conciv/extension-testkit']`; `INLINED_PACKAGES: Record<string, string[]>` map declaring which workspace packages each published package bundles — consumed by Task 8's guard.

- [ ] **Step 1: Write the failing guard test**

```ts
import {describe, expect, it} from 'vitest'
import {assertPublicSet} from '../src/guards.ts'

describe('public set', () => {
  it('accepts the 3-package public set of this repo', async () => {
    await expect(assertPublicSet(new URL('../../..', import.meta.url).pathname)).resolves.toBeUndefined()
  })
})
```

Run: `pnpm turbo run test --filter=@conciv/publish` — Expected: FAIL (27-name list vs repo state once Step 2 flips manifests; order the steps so the test is red first: write test → flip manifests → shrink list → green).

- [ ] **Step 2: Flip the manifests**

For each of the 25 packages (cli, client, contract, core, db, embed, extension-compiler, grab, harness, mascot, page*, plugin, protocol, serve, solid-diffs, solid-streamdown, storage-history, tools, ui-kit-chat, ui-kit-chat-tools, ui-kit-system, ui-kit-tap, ui-kit-terminal, uno-preset, extensions/terminal, extensions/test-runner, extensions/whiteboard — *page, publish, harness-testkit, uno-preset are already private; skip those, net count 25 total public flips minus already-private): set `"private": true`, delete `publishConfig`, delete `publint` and `attw` from scripts. One-shot script (run from repo root, review the diff before committing):

```bash
node -e '
const fs = require("fs")
const keep = new Set(["@conciv/it", "@conciv/extension", "@conciv/extension-testkit"])
const dirs = [...fs.readdirSync("packages").map((d) => `packages/${d}`), ...fs.readdirSync("packages/extensions").map((d) => `packages/extensions/${d}`)]
for (const dir of dirs) {
  const file = `${dir}/package.json`
  if (!fs.existsSync(file)) continue
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"))
  if (!pkg.name?.startsWith("@conciv/") || keep.has(pkg.name)) continue
  pkg.private = true
  delete pkg.publishConfig
  if (pkg.scripts) { delete pkg.scripts.publint; delete pkg.scripts.attw }
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
}
'
pnpm install --lockfile-only
pnpm format
```

- [ ] **Step 3: Shrink `PUBLIC_PACKAGES`**

In `packages/publish/src/guards.ts`:

```ts
const PUBLIC_PACKAGES = ['@conciv/it', '@conciv/extension', '@conciv/extension-testkit']
```

Update the file's doc-comment-free structure as-is; also fix `PACKAGE_GROUPS` only if extension-testkit lives outside them (it is `packages/extension-testkit` — covered).

- [ ] **Step 4: Verify guards + whole repo, commit**

Run: `pnpm turbo run test --filter=@conciv/publish && pnpm typecheck && pnpm build && pnpm test`
Expected: all green — nothing imports the removed scripts; workspace resolution ignores `private`.

```bash
git add packages pnpm-lock.yaml
git commit -m "feat: flip internal packages private, shrink public set to 3" -- packages pnpm-lock.yaml
```

---

### Task 8: bundled-dependency drift guard

**Files:**

- Modify: `packages/publish/src/guards.ts`, `packages/publish/src/cli.ts`
- Test: `packages/publish/test/guards.test.ts`

**Interfaces:**

- Consumes: `INLINED_PACKAGES` declaration (defined here), workspace manifests.
- Produces: `assertBundledDeps(cwd: string): Promise<void>` — throws when a published package's `dependencies` drift from the union of its inlined packages' third-party deps. Wired into `release` and `check` commands.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {assertBundledDeps} from '../src/guards.ts'

const root = new URL('../../..', import.meta.url).pathname

describe('bundled dependency guard', () => {
  it('passes on the current tree', async () => {
    await expect(assertBundledDeps(root)).resolves.toBeUndefined()
  })
})
```

Run: `pnpm turbo run test --filter=@conciv/publish` — Expected: FAIL (function missing).

- [ ] **Step 2: Implement in `guards.ts`**

```ts
const DEDUPE_DEPENDENCIES = new Set(['solid-js', '@ark-ui/solid', '@tanstack/solid-router'])

const INLINED_PACKAGES: Record<string, string[]> = {
  '@conciv/it': [
    '@conciv/plugin',
    '@conciv/core',
    '@conciv/harness',
    '@conciv/serve',
    '@conciv/db',
    '@conciv/tools',
    '@conciv/cli',
    '@conciv/protocol',
    '@conciv/contract',
    '@conciv/extension-compiler',
    '@conciv/embed',
    '@conciv/extension-terminal',
    '@conciv/extension-test-runner',
    '@conciv/extension-whiteboard',
    '@conciv/client',
    '@conciv/grab',
    '@conciv/mascot',
    '@conciv/page',
    '@conciv/solid-streamdown',
    '@conciv/solid-diffs',
    '@conciv/storage-history',
    '@conciv/ui-kit-tap',
  ],
  '@conciv/extension': [
    '@conciv/contract',
    '@conciv/grab',
    '@conciv/protocol',
    '@conciv/ui-kit-system',
    '@conciv/ui-kit-chat',
    '@conciv/ui-kit-chat-tools',
    '@conciv/ui-kit-terminal',
    '@conciv/solid-streamdown',
    '@conciv/solid-diffs',
    '@conciv/tools',
  ],
  '@conciv/extension-testkit': [
    '@conciv/harness-testkit',
    '@conciv/extension-compiler',
    '@conciv/contract',
    '@conciv/grab',
    '@conciv/protocol',
  ],
}

export async function assertBundledDeps(cwd: string): Promise<void> {
  const manifests = await readManifests(cwd)
  const byName = new Map(manifests.map((pkg) => [pkg.name, pkg]))
  const failures: string[] = []
  for (const [published, inlined] of Object.entries(INLINED_PACKAGES)) {
    const manifest = byName.get(published)
    if (!manifest) {
      failures.push(`${published}: manifest not found`)
      continue
    }
    const declared = new Set(Object.keys(manifest.dependencies ?? {}))
    const required = new Set(
      inlined
        .flatMap((name) => Object.keys(byName.get(name)?.dependencies ?? {}))
        .filter((dep) => !dep.startsWith('@conciv/') && !DEDUPE_DEPENDENCIES.has(dep)),
    )
    const missing = [...required].filter((dep) => !declared.has(dep))
    if (missing.length > 0) failures.push(`${published}: missing bundled deps [${missing.join(', ')}]`)
  }
  if (failures.length > 0) throw new Error(`bundled dependency drift:\n${failures.join('\n')}`)
}
```

Extend the `Manifest` type in the same file with `dependencies?: Record<string, string>`. Reality check while implementing: the exact `INLINED_PACKAGES` lists above are the S4/S1 expectation — reconcile them against Task 5/3/6's actual `noExternal` reach (a package in the list whose deps the bundle never imports produces a false "missing"; in that case the published package legitimately over-declares — the guard checks `missing` only, not extras, precisely to stay cheap. Peers like vite/next/unplugin are covered because they appear in the inlined packages' `peerDependencies`, not `dependencies` — the guard reads `dependencies` only).

Also extend `assertPublicSet` coverage: every non-published `@conciv/*` workspace package must appear in at least one `INLINED_PACKAGES` list OR be node-tooling that never ships (`@conciv/publish`, `@conciv/harness-testkit` is listed, `@conciv/extension-testkit` is published, `@conciv/uno-preset` build-time only). Add:

```ts
const NEVER_SHIPPED = new Set([
  '@conciv/publish',
  '@conciv/uno-preset',
  '@conciv/extension-testkit',
  '@conciv/it',
  '@conciv/extension',
])

export function assertInlineCoverage(names: string[]): void {
  const covered = new Set(Object.values(INLINED_PACKAGES).flat())
  const uncovered = names.filter((name) => !covered.has(name) && !NEVER_SHIPPED.has(name))
  if (uncovered.length > 0) throw new Error(`workspace packages neither published nor inlined: ${uncovered.join(', ')}`)
}
```

with a test feeding it all workspace package names.

- [ ] **Step 3: Wire into cli**

In `packages/publish/src/cli.ts`, `check` and `release` commands: after `assertPublicSet(cwd)` (add it to `check` too), call `await assertBundledDeps(cwd)`. Change the turbo invocation in both from `turbo('build', 'publint', 'attw')` to `turbo('build', 'build:publish', 'publint', 'attw')`. Same change in `snapshot`.

- [ ] **Step 4: Test, commit**

Run: `pnpm turbo run test --filter=@conciv/publish && pnpm release:check`
Expected: guards green; release:check builds publish dists and passes publint/attw for the 3 packages. Restore dev dists afterwards: `pnpm turbo run build --force --filter=@conciv/it --filter=@conciv/extension --filter=@conciv/extension-testkit --filter=@conciv/embed --filter='@conciv/extension-*'`.

```bash
git add packages/publish
git commit -m "feat(publish): bundled-dependency and inline-coverage guards" -- packages/publish
```

---

### Task 9: packed-install smoke test

**Files:**

- Create: `packages/it/test/packed-install.e2e.test.ts`
- Create: `packages/it/test/fixtures/packed-app/` (minimal vite app: `package.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `conciv/extensions/smoke.tsx`)
- Modify: `packages/it/package.json` (`test:e2e` script), `.github/workflows/ci.yml` (job or step running it)

**Interfaces:**

- Consumes: publish dists from Tasks 3–6 (`build:publish` must run first — express via turbo: give `test:e2e` in `packages/it` a `dependsOn` including `build:publish` via a package-level turbo override, or run the pack step inside the test).
- Produces: CI-blocking proof that the 3 tarballs install and boot standalone.

- [ ] **Step 1: Fixture app**

`packages/it/test/fixtures/packed-app/package.json`:

```json
{
  "name": "packed-smoke",
  "private": true,
  "type": "module",
  "dependencies": {
    "@conciv/it": "file:./tarballs/conciv-it.tgz",
    "@conciv/extension": "file:./tarballs/conciv-extension.tgz",
    "solid-js": "^1.9.13",
    "@ark-ui/solid": "^5.0.0",
    "@tanstack/solid-router": "^1.0.0"
  },
  "devDependencies": {
    "@conciv/extension-testkit": "file:./tarballs/conciv-extension-testkit.tgz",
    "vite": "^7.0.0"
  }
}
```

(Copy the real solid/ark/router version ranges from `packages/embed/package.json` when writing the fixture.) `vite.config.ts` registers the plugin from `@conciv/it/plugin/vite` — mirror the plugin usage from `apps/examples/tanstack-start`'s vite config, minus app-framework specifics. `conciv/extensions/smoke.tsx` is a minimal `defineExtension` from `@conciv/extension` (copy the smallest example from `docs/testing-extensions.md` or extension-testkit's own fixtures).

- [ ] **Step 2: The e2e test**

```ts
import {execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const fixture = fileURLToPath(new URL('./fixtures/packed-app', import.meta.url))

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, {cwd, encoding: 'utf8', stdio: 'pipe'})

describe('packed install', () => {
  it('packs, installs, and builds a standalone app', () => {
    const work = join(repoRoot, 'packages/it/test/.packed-work')
    rmSync(work, {recursive: true, force: true})
    cpSync(fixture, work, {recursive: true})
    mkdirSync(join(work, 'tarballs'), {recursive: true})
    run(
      'pnpm',
      [
        'turbo',
        'run',
        'build:publish',
        '--filter=@conciv/it',
        '--filter=@conciv/extension',
        '--filter=@conciv/extension-testkit',
      ],
      repoRoot,
    )
    run('pnpm', ['pack', '--out', join(work, 'tarballs/conciv-it.tgz')], join(repoRoot, 'packages/it'))
    run('pnpm', ['pack', '--out', join(work, 'tarballs/conciv-extension.tgz')], join(repoRoot, 'packages/extension'))
    run(
      'pnpm',
      ['pack', '--out', join(work, 'tarballs/conciv-extension-testkit.tgz')],
      join(repoRoot, 'packages/extension-testkit'),
    )
    run('npm', ['install', '--no-audit', '--no-fund'], work)
    const buildOutput = run('npx', ['vite', 'build'], work)
    expect(buildOutput).toContain('built in')
    const binHelp = run('npx', ['conciv', '--help'], work)
    expect(binHelp.length).toBeGreaterThan(0)
  }, 600_000)
})
```

npm (not pnpm) installs the fixture deliberately: strict hoisting differences are exactly what this test must catch. Timeout is generous; tighten after measuring real cost (Tight test timeouts rule) — size it to observed duration + margin, not stacked ceilings.

- [ ] **Step 3: Wire test:e2e + CI**

`packages/it/package.json`: `"test:e2e": "vitest run test/packed-install.e2e.test.ts"`. Confirm `turbo.json`'s `test:e2e` task exists (it does — root `pnpm test` runs it) and inherits `dependsOn` that builds first; if `test:e2e` lacks `build:publish` ordering, the in-test `turbo run build:publish` call covers it regardless.

Add `.packed-work` to `.gitignore`.

CI: `.github/workflows/ci.yml` already runs the repo test tasks if `test:e2e` is part of `pnpm test` (root script runs `turbo run test:e2e`) — verify, and if e2e is a separate CI job matrix, add the filter there.

- [ ] **Step 4: Run, commit**

Run: `pnpm turbo run test:e2e --filter=@conciv/it`
Expected: PASS (first run is slow; note the real duration in the test timeout).

```bash
git add packages/it .gitignore
git commit -m "test(it): packed-install smoke proving standalone tarballs" -- packages/it .gitignore
```

---

### Task 10: fallow, changeset, docs

**Files:**

- Modify: `.fallowrc.json`, `README.md`, `AGENTS.md`, `apps/site` docs pages that list packages (grep for `@conciv/` tables), `.changeset/publish-consolidation.md` (create)

- [ ] **Step 1: fallow config**

`.fallowrc.json` `publicPackages` → `["@conciv/it", "@conciv/extension", "@conciv/extension-testkit"]`.

Run: `pnpm exec fallow audit --changed-since main --format json`
Triage every INTRODUCED finding: newly-visible dead exports in now-internal packages get deleted (verify each with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'` first — "USED but file unreachable" means missing entry point, not dead code); intentionally-kept surfaces get an `ignoreExports` entry with the file pattern.

- [ ] **Step 2: changeset**

`.changeset/publish-consolidation.md`:

```markdown
---
'@conciv/it': patch
---

Consolidate publishing: @conciv/it now bundles all internal packages; only @conciv/it, @conciv/extension, and @conciv/extension-testkit are published.
```

- [ ] **Step 3: docs**

- `README.md`: package table — mark internal packages as workspace-internal (not installed from npm); extension-author section points to `@conciv/extension` + `@conciv/extension-testkit`.
- `AGENTS.md` Releasing section: rewrite the "Adding a new PUBLISHED package" paragraph — new rule: adding a workspace package requires adding it to `INLINED_PACKAGES` in `packages/publish/src/guards.ts` (or `NEVER_SHIPPED`), and `release:check` now also runs `build:publish`. Note the 3-package public set.
- Site docs: `grep -rn '@conciv/' apps/site/src --include='*.md*' -l` and fix any page telling users to install an internal package.

Follow docs-writing-style: no em dashes, concise, example-first.

- [ ] **Step 4: Final gates, commit**

Run: `pnpm typecheck && pnpm build && pnpm test && pnpm release:check && pnpm exec fallow audit --changed-since main --format json`
Expected: everything green, no INTRODUCED findings.

```bash
git add .fallowrc.json .changeset README.md AGENTS.md apps/site
git commit -m "docs: publish consolidation — 3-package public set" -- .fallowrc.json .changeset README.md AGENTS.md apps/site
```

---

## Execution notes

- Tasks 1→2→3→4→5→6 are strictly ordered (each consumes the previous task's interfaces). Tasks 7→8 follow 6. Task 9 needs 3–8. Task 10 is last.
- After any task that ran `build:publish`, restore dev dists (`pnpm turbo run build --force --filter=<pkg>`) before running the wider suite — publish dists in `dist/` would otherwise leak into dev-mode tests (the `.publish-build` marker exists to catch this; several suites skip on it, they must never run against the wrong artifact).
- Do not push. Local commits only until the user verifies the packed smoke in their environment (hard rule).
- If tsdown/rolldown option names drift from this plan (`noExternal`, `plugins`, `onSuccess`), read the installed tsdown version's docs/source first (Read dep source, don't guess) — the dist assertion tests are the contract, the config syntax is not.
