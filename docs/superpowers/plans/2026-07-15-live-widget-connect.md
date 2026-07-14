# Live Widget Connect (issue #58, track B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A conciv.dev visitor connects the agent CLI on their own machine (`npx @conciv/cli connect`) and the conciv widget appears on the landing page, powered by their agent, driving the page.

**Architecture:** Zero backend for us. The landing page mints a token, the visitor runs the connector (directly or by pasting a pair-URL prompt into Claude Code), the connector boots core on `127.0.0.1:4732-4741` serving under a `/t/<token>` path prefix with CORS locked to `https://conciv.dev`, and the page polls that range, then mounts the prebuilt widget global bundle pointed at the discovered base. Chrome shows one Local Network Access permission prompt (spiked and proven 2026-07-13); Firefox/Safari need none.

**Tech Stack:** citty (CLI), Hono `.mount` (token gate), TanStack Start server routes (pair page), React (connect panel), Playwright+vitest ITs, existing `@conciv/harness-testkit`.

**Spec:** `docs/superpowers/specs/2026-07-15-site-live-widget-connect-design.md` — read it first.

## Global Constraints

- Repo style: functions not classes, zero code comments (lint deletes them), no semicolons, single quotes, no `any`/`as`/non-null `!`, no IIFEs, no barrel files, no abbreviations in identifiers.
- TDD: red test first, then code. Tests assert observable behavior via roles/text, never CSS classes or test-ids. Real browser (Playwright/Chromium) for UI, `environment: 'node'` pinned in every vitest config.
- Build via turbo only (`pnpm turbo run build --filter=<pkg>`), never hand-rebuild dist.
- Commit after each task with an explicit pathspec (`git commit -- <paths>`). NEVER push.
- No new external npm deps (workspace `@conciv/*` deps are fine to add).
- All `@conciv/*` versions move in lockstep via one changeset (`.changeset/`, `fixed` group).
- Port range is exactly 4732–4741. Allowed origin is exactly `https://conciv.dev` by default; `--origin` flag overrides for local testing.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.

---

### Task 1: Core token gate + health endpoint

**Files:**

- Modify: `packages/core/src/app.ts` (add `/health` route after the cors middleware in the chain)
- Modify: `packages/core/src/start.ts` (add `accessToken` opt; serve mounted app; reject on listen error is handled in Task 1a below if hit)
- Test: `packages/core/test/api/connect-gate.it.test.ts`

**Interfaces:**

- Consumes: `start(opts: StartOpts)` (`packages/core/src/start.ts:35`), `createFakeHarness` from `@conciv/harness-testkit` (core devDep — check `packages/core/package.json`, add `workspace:^` devDep if absent).
- Produces: `StartOpts.accessToken?: string`. When set, every route is served ONLY under `/t/<accessToken>/...` (prefix stripped, wrong/missing prefix → 404). New route `GET /health` → `200 {"ok":true,"harness":"<id>"}` on the inner app (so gated: `/t/<token>/health`).

- [x] **Step 1: Write the failing test**

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {start, type Engine} from '@conciv/core/start'

let engine: Engine

beforeAll(async () => {
  engine = await start({
    options: {},
    root: mkdtempSync(join(tmpdir(), 'conciv-gate-')),
    launchEditor: () => {},
    harness: createFakeHarness({id: 'fake-gate'}),
    accessToken: 'tok-123',
  })
}, 30_000)

afterAll(async () => {
  await engine.stop()
})

describe('token-gated core', () => {
  it('serves health under the token prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${engine.port}/t/tok-123/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ok: true, harness: 'fake-gate'})
  })

  it('404s the wrong token and the bare path', async () => {
    const wrong = await fetch(`http://127.0.0.1:${engine.port}/t/nope/health`)
    const bare = await fetch(`http://127.0.0.1:${engine.port}/health`)
    expect(wrong.status).toBe(404)
    expect(bare.status).toBe(404)
  })

  it('serves rpc under the prefix', async () => {
    const res = await fetch(`http://127.0.0.1:${engine.port}/t/tok-123/rpc/sessions/list`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{"json":null}',
    })
    expect(res.status).toBe(200)
  })
})
```

- [x] **Step 2: Run it, verify it fails**

Run: `pnpm turbo run build --filter=@conciv/core && cd packages/core && pnpm vitest run test/api/connect-gate.it.test.ts`
Expected: FAIL — `accessToken` not a known opt (TS error) or health 404.

- [x] **Step 3: Implement**

In `packages/core/src/app.ts`, inside the Hono chain right after `.use(corsMiddleware())` (line ~105):

```ts
.get('/health', (c) => c.json({ok: true, harness: harness.id}))
```

(`harness` is the resolved adapter already in scope in `makeApp` — confirm the local name by reading the surrounding code; it comes from `opts.harness ?? requireHarness(cfg.harness)`.)

In `packages/core/src/start.ts`:

```ts
export type StartOpts = {
  // existing fields …
  accessToken?: string
}
```

At the serve site (line ~77):

```ts
import {Hono} from 'hono'

const served = opts.accessToken ? new Hono().mount(`/t/${opts.accessToken}`, app.fetch) : app
const {port, close} = await serveHono({fetch: served.fetch.bind(served), port: requestedPort})
```

- [x] **Step 4: Run test, verify pass**

Run: same as Step 2. Expected: 3 passing.

- [x] **Step 5: Typecheck + commit**

```bash
pnpm turbo run typecheck --filter=@conciv/core
git add packages/core/src/app.ts packages/core/src/start.ts packages/core/test/api/connect-gate.it.test.ts packages/core/package.json
git commit -m "feat(core): token-gated serving via /t/<token> mount + /health" -- packages/core
```

---

### Task 1a (only if Task 2's port-scan hangs): serveHono listen-error rejection

`serve()` from `@hono/node-server` may emit `error` instead of `listening` on a busy port, and `serveHono` (`packages/serve/src/serve.ts:39`) only awaits `listening` — a busy port would hang forever. If Task 2's occupied-port test hangs, change that promise to:

```ts
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve)
  server.once('error', reject)
})
```

Test lives in Task 2 (occupied-port case). Commit with Task 2.

---

### Task 2: `connect` command in @conciv/cli

**Files:**

- Create: `packages/cli/src/connect.ts`
- Modify: `packages/cli/src/bin.ts` (register subcommand)
- Modify: `packages/cli/package.json` (add deps `@conciv/core`, `@conciv/harness` `workspace:^`; devDep `@conciv/harness-testkit`; add an exports subpath `"./connect": {"types": "./dist/connect.d.ts", "import": "./dist/connect.js"}` — Task 5 imports `runConnect` from `@conciv/cli/connect`; mirror the existing exports shape and check the tsdown/build config emits that entry; update `description` — it currently says "internal, do not install directly", now it's visitor-facing)
- Test: `packages/cli/test/connect.it.test.ts`

**Interfaces:**

- Consumes: `start()` with `accessToken` (Task 1), `getHarness` from `@conciv/harness`, `createFakeHarness` from `@conciv/harness-testkit`.
- Produces: exported `runConnect(opts: ConnectOpts): Promise<Engine>` where `ConnectOpts = {token: string; harness?: string; workspace?: string; origin?: string; harnessAdapter?: HarnessAdapter; log?: (line: string) => void}`. CLI: `conciv connect --token <t> [--harness claude|codex|gemini-cli|opencode|pi] [--workspace .] [--origin <url>]`.

- [ ] **Step 1: Write the failing test**

```ts
import {createServer} from 'node:http'
import {afterAll, describe, expect, it} from 'vitest'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '../src/connect.js'
import type {Engine} from '@conciv/core/start'

const engines: Engine[] = []
const closers: Array<() => void> = []

afterAll(async () => {
  await Promise.all(engines.map((engine) => engine.stop()))
  closers.forEach((close) => close())
})

describe('conciv connect', () => {
  it('boots a token-gated core on the first free port in range', async () => {
    const engine = await runConnect({token: 'tok-a', harnessAdapter: createFakeHarness({id: 'fake-connect'})})
    engines.push(engine)
    expect(engine.port).toBeGreaterThanOrEqual(4732)
    expect(engine.port).toBeLessThanOrEqual(4741)
    const health = await fetch(`http://127.0.0.1:${engine.port}/t/tok-a/health`)
    expect(health.status).toBe(200)
  })

  it('skips an occupied port', async () => {
    const blocker = createServer(() => {})
    await new Promise<void>((resolve) => blocker.listen(4732, '127.0.0.1', resolve))
    closers.push(() => blocker.close())
    const engine = await runConnect({token: 'tok-b', harnessAdapter: createFakeHarness({id: 'fake-busy'})})
    engines.push(engine)
    expect(engine.port).toBeGreaterThan(4732)
  }, 20_000)

  it('uses a throwaway workspace by default', async () => {
    const engine = await runConnect({token: 'tok-c', harnessAdapter: createFakeHarness({id: 'fake-ws'})})
    engines.push(engine)
    expect(engine.cfg.stateRoot).not.toBe(process.cwd())
    expect(engine.cfg.stateRoot).toContain('conciv-connect-')
  })
})
```

(If two tests race on the same port, run them serially — vitest default in-file order is fine.)

- [ ] **Step 2: Run it, verify fail**

Run: `pnpm turbo run build --filter=@conciv/cli && cd packages/cli && pnpm vitest run test/connect.it.test.ts`
Expected: FAIL — `../src/connect.js` does not exist.

- [ ] **Step 3: Implement `packages/cli/src/connect.ts`**

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand} from 'citty'
import {start, type Engine} from '@conciv/core/start'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'

const FIRST_PORT = 4732
const LAST_PORT = 4741
const DEFAULT_ORIGIN = 'https://conciv.dev'

export type ConnectOpts = {
  token: string
  harness?: string
  workspace?: string
  origin?: string
  harnessAdapter?: HarnessAdapter
  log?: (line: string) => void
}

function resolveWorkspace(workspace: string | undefined): string {
  if (workspace === '.') return process.cwd()
  return mkdtempSync(join(tmpdir(), 'conciv-connect-'))
}

function resolveAdapter(opts: ConnectOpts): HarnessAdapter {
  if (opts.harnessAdapter) return opts.harnessAdapter
  const adapter = getHarness(opts.harness ?? 'claude')
  if (!adapter) throw new Error(`unknown harness "${opts.harness}" — try claude, codex, gemini-cli, opencode or pi`)
  return adapter
}

export async function runConnect(opts: ConnectOpts): Promise<Engine> {
  const adapter = resolveAdapter(opts)
  const root = resolveWorkspace(opts.workspace)
  const log = opts.log ?? (() => {})
  let lastError: unknown
  for (let port = FIRST_PORT; port <= LAST_PORT; port += 1) {
    try {
      const engine = await start({
        options: {harness: adapter.id, stateRoot: root},
        root,
        port,
        launchEditor: () => {},
        harness: adapter,
        accessToken: opts.token,
        allowedOrigins: [opts.origin ?? DEFAULT_ORIGIN],
      })
      log(`connected: conciv core on 127.0.0.1:${engine.port} (harness: ${adapter.id})`)
      log('return to your browser tab — keep this command running')
      return engine
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`no free port between ${FIRST_PORT} and ${LAST_PORT}: ${String(lastError)}`)
}

export const connectCommand = defineCommand({
  meta: {name: 'connect', description: 'connect this machine to the conciv widget on conciv.dev'},
  args: {
    token: {type: 'string', required: true, description: 'pairing token from conciv.dev'},
    harness: {type: 'string', description: 'claude (default), codex, gemini-cli, opencode or pi'},
    workspace: {type: 'string', description: 'pass "." to use the current directory (default: throwaway temp dir)'},
    origin: {type: 'string', description: 'override the allowed browser origin (testing only)'},
  },
  run: async ({args}) => {
    await runConnect({
      token: args.token,
      harness: args.harness,
      workspace: args.workspace,
      origin: args.origin,
      log: (line) => console.log(line),
    })
    await new Promise(() => {})
  },
})
```

Register in `packages/cli/src/bin.ts`:

```ts
import {connectCommand} from './connect.js'

subCommands: {tools: toolsCommand, connect: connectCommand},
```

(`console.log` in `run` may hit the no-comments/lint rules — the CLI already prints via its command runners; mirror how `packages/cli/src/request.ts` outputs. If lint objects, route through the same helper it uses. The dangling `await new Promise(() => {})` keeps the process alive; SIGINT kills it — that is the intended lifecycle.)

- [ ] **Step 4: Run tests, verify pass**

Run: same as Step 2 (rebuild first: `pnpm turbo run build --filter=@conciv/cli`). Expected: 3 passing. If the occupied-port test HANGS: implement Task 1a, rebuild `@conciv/serve` + core, rerun.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
pnpm turbo run typecheck --filter=@conciv/cli
pnpm lint
git add packages/cli/src/connect.ts packages/cli/src/bin.ts packages/cli/package.json packages/cli/test/connect.it.test.ts pnpm-lock.yaml
git commit -m "feat(cli): conciv connect — pair a local agent with conciv.dev" -- packages/cli pnpm-lock.yaml
```

---

### Task 3: Site pair route + widget bundle asset

**Files:**

- Create: `apps/site/src/routes/pair.$token.ts`
- Create: `apps/site/scripts/copy-widget-bundle.mjs`
- Modify: `apps/site/package.json` (prebuild copy script + `@conciv/embed` devDep for turbo build ordering)
- Modify: `apps/site/.gitignore` (or root) — ignore `apps/site/public/conciv-widget.global.js`
- Test: `apps/site/test/pair-route.test.ts` (+ `apps/site/vitest.config.ts`, node environment)

**Interfaces:**

- Consumes: TanStack Start server-route pattern (mirror `apps/site/src/routes/llms[.]txt.ts` — `createFileRoute` with `server.handlers.GET`).
- Produces: `GET /pair/<token>` → `text/plain` instructions embedding the token; `/conciv-widget.global.js` served as a static asset from `apps/site/public/`. Exported `pairText(token: string, origin: string): string` for the test.

- [ ] **Step 1: Write the failing test**

`apps/site/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {environment: 'node', include: ['test/**/*.test.ts']},
})
```

`apps/site/test/pair-route.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {pairText} from '../src/lib/pair-text'

describe('pair instructions', () => {
  it('embeds the token in the connect command', () => {
    const text = pairText('tok-xyz', 'https://conciv.dev')
    expect(text).toContain('npx @conciv/cli connect --token tok-xyz')
    expect(text).toContain('keep it running')
    expect(text).toContain('https://conciv.dev')
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `cd apps/site && pnpm vitest run`
Expected: FAIL — `pair-text` missing. (Add `"test": "vitest run"` to site scripts if absent; turbo picks it up.)

- [ ] **Step 3: Implement**

`apps/site/src/lib/pair-text.ts`:

```ts
export function pairText(token: string, origin: string): string {
  return [
    'You are connecting this machine to the conciv widget on ' + origin + '.',
    '',
    'Run this command and KEEP IT RUNNING (do not background it and exit):',
    '',
    `  npx @conciv/cli connect --token ${token}`,
    '',
    'It starts a local conciv core bound to 127.0.0.1 in a throwaway workspace,',
    'reachable only by ' + origin + ' with this token.',
    '',
    'When it prints "connected", tell the user to return to their browser tab on',
    origin + ' — the widget there is now powered by this machine. Chrome will show',
    'a "local network access" permission prompt in that tab; the user should allow it.',
  ].join('\n')
}
```

`apps/site/src/routes/pair.$token.ts` (mirror the `llms[.]txt.ts` shape):

```ts
import {createFileRoute} from '@tanstack/react-router'
import {pairText} from '@/lib/pair-text'

export const Route = createFileRoute('/pair/$token')({
  server: {
    handlers: {
      GET({params}) {
        return new Response(pairText(params.token, 'https://conciv.dev'), {
          headers: {'content-type': 'text/plain; charset=utf-8'},
        })
      },
    },
  },
})
```

(Route-tree is generated — run `pnpm dev` once or the build so `routeTree.gen.ts` picks it up; check how other routes appear there.)

`apps/site/scripts/copy-widget-bundle.mjs`:

```js
import {copyFileSync, mkdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const source = fileURLToPath(new URL('../../../packages/embed/dist/conciv-widget.global.js', import.meta.url))
const target = fileURLToPath(new URL('../public/conciv-widget.global.js', import.meta.url))
mkdirSync(fileURLToPath(new URL('../public', import.meta.url)), {recursive: true})
copyFileSync(source, target)
```

`apps/site/package.json`: `"build": "node scripts/copy-widget-bundle.mjs && vite build"` and add `"@conciv/embed": "workspace:^"` to devDependencies (turbo build ordering — embed dist must exist first). If fallow flags the devDep as unused, keep it and note the script consumer; check `.fallowrc.json` options before suppressing.

- [ ] **Step 4: Run tests + build, verify**

```bash
cd apps/site && pnpm vitest run
pnpm turbo run build --filter=conciv-site
ls apps/site/public/conciv-widget.global.js
curl -s http://localhost:3001/pair/tok-demo   # with `pnpm dev` running, expect the text
```

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/routes/pair.\$token.ts apps/site/src/lib/pair-text.ts apps/site/scripts/copy-widget-bundle.mjs apps/site/package.json apps/site/vitest.config.ts apps/site/test/pair-route.test.ts apps/site/src/routeTree.gen.ts pnpm-lock.yaml .gitignore
git commit -m "feat(site): /pair/<token> instructions + widget bundle asset" -- apps/site pnpm-lock.yaml .gitignore
```

---

### Task 4: Connect panel + poller + widget mount on the landing page

**Files:**

- Create: `apps/site/src/lib/connect-live.ts` (poller + mount, framework-free logic)
- Create: `apps/site/src/components/landing/ConnectLive.tsx` (panel UI)
- Modify: `apps/site/src/routes/index.tsx` (place the panel — find the hero section in `components/landing/`)
- Test: `apps/site/test/connect-live.test.ts` (poller logic, node env with injected fetch)

**Interfaces:**

- Consumes: `/t/<token>/health` (Task 1), widget global bundle asset (Task 3), `window.__CONCIV_API_BASE__` (read by the embed bundle at boot, `apps/conciv/src/lib/api-base.ts:11`).
- Produces: `findCore(token, ports, fetchLike, signal) => Promise<string | null>` (returns the gated base URL); `mountWidget(base) => void` (sets `window.__CONCIV_API_BASE__`, injects the script tag once).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {findCore} from '../src/lib/connect-live'

function fakeFetch(alivePort: number): typeof fetch {
  return async (input) => {
    const url = String(input)
    if (url.includes(`:${alivePort}/`)) return new Response('{"ok":true}', {status: 200})
    throw new TypeError('connection refused')
  }
}

describe('findCore', () => {
  it('returns the gated base for the first healthy port', async () => {
    const base = await findCore('tok-1', [4732, 4733, 4734], fakeFetch(4733))
    expect(base).toBe('http://127.0.0.1:4733/t/tok-1')
  })

  it('returns null when nothing answers', async () => {
    const base = await findCore('tok-1', [4732, 4733], fakeFetch(9999))
    expect(base).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify fail** — `cd apps/site && pnpm vitest run test/connect-live.test.ts` → module missing.

- [ ] **Step 3: Implement `apps/site/src/lib/connect-live.ts`**

```ts
export const CONNECT_PORTS = [4732, 4733, 4734, 4735, 4736, 4737, 4738, 4739, 4740, 4741]

export async function findCore(
  token: string,
  ports: readonly number[],
  fetchLike: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const port of ports) {
    const base = `http://127.0.0.1:${port}/t/${token}`
    try {
      const response = await fetchLike(`${base}/health`, {signal})
      if (response.ok) return base
    } catch {
      if (signal?.aborted) return null
    }
  }
  return null
}

export function mountWidget(base: string): void {
  if (document.querySelector('script[data-conciv-embed]')) return
  window.__CONCIV_API_BASE__ = base
  const script = document.createElement('script')
  script.src = '/conciv-widget.global.js'
  script.dataset.concivEmbed = 'true'
  document.body.appendChild(script)
}
```

(`window.__CONCIV_API_BASE__` needs the global declaration — import or redeclare the `declare global` block from the embed's api-base contract; keep it in this file.)

- [ ] **Step 4: Panel component `ConnectLive.tsx`** — React, site's existing UI conventions (look at `components/landing/` + `components/ui/` for buttons/cards; use the site's existing styling system, don't invent one):

State machine: `idle → waiting → connected`. On open: `token = crypto.randomUUID()`, two copy-to-clipboard rows —
prompt: `Read https://conciv.dev/pair/${token} and follow the instructions` and command: `npx @conciv/cli connect --token ${token}`.
While `waiting`: run `findCore(token, CONNECT_PORTS, fetch)` every 2s (abort on unmount), copy under the spinner: “waiting for your agent… Chrome will ask to allow local network access — that’s your agent connecting.”
On found: `mountWidget(base)`, state `connected`, render chip “connected — agent on your machine”, poll the same health URL every 5s to detect drops (back to `waiting` on failure).
In dev the vite plugin already injects a widget — if `document.querySelector('[data-conciv-root]')` exists, render the chip with “dev widget active” and skip mounting.
Place it in the hero section of `routes/index.tsx` / the relevant `components/landing/*` file as “● Try it live — connect your agent”.

- [ ] **Step 5: Verify in browser**

```bash
pnpm turbo run build --filter=@conciv/embed
cd apps/site && pnpm dev
```

In a second terminal: `pnpm turbo run build --filter=@conciv/cli && node packages/cli/dist/bin.js connect --token <token-from-panel> --origin http://localhost:3001`
Open http://localhost:3001, click connect, expect the chip + working widget chat (real claude). (`--origin` override exists exactly for this.)

- [ ] **Step 6: Run site tests + lint + commit**

```bash
cd apps/site && pnpm vitest run && cd ../..
pnpm lint
git add apps/site/src/lib/connect-live.ts apps/site/src/components/landing/ConnectLive.tsx apps/site/src/routes/index.tsx apps/site/test/connect-live.test.ts
git commit -m "feat(site): landing connect panel — pair, poll, mount live widget" -- apps/site
```

---

### Task 5: E2E — prod-origin flow with LNA permission (promote the spike)

**Files:**

- Create: `apps/site/test/live-connect.it.test.ts`
- Modify: `apps/site/package.json` (devDeps: `playwright`, `@conciv/harness-testkit`, `@conciv/cli` `workspace:^`)

**Interfaces:**

- Consumes: `runConnect` (Task 2) with `createFakeHarness`, built site served by `wrangler dev`, Chromium flags `--ip-address-space-overrides` + `local-network-access` permission (proven recipe: see spike test `packages/embed/test/spike-pna.it.test.ts` on branch history / spike notes in the spec).

- [ ] **Step 1: Write the test**

```ts
import {spawn, type ChildProcess} from 'node:child_process'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/cli/connect'
import type {Engine} from '@conciv/core/start'

const SITE_PORT = 8787
let site: ChildProcess
let browser: Browser
let engine: Engine | null = null

beforeAll(async () => {
  site = spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', String(SITE_PORT)], {cwd: import.meta.dirname + '/..'})
  await new Promise<void>((resolve, reject) => {
    site.stdout?.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('Ready')) resolve()
    })
    site.on('exit', () => reject(new Error('wrangler dev exited')))
  })
  browser = await chromium.launch({
    args: [`--ip-address-space-overrides=127.0.0.1:${SITE_PORT}=public`],
  })
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await engine?.stop()
  site?.kill()
})

describe('live connect on the built site', () => {
  it('pairs, mounts the widget and completes a chat turn', async () => {
    const page = await browser.newPage()
    await page.context().grantPermissions(['local-network-access'], {origin: `http://127.0.0.1:${SITE_PORT}`})
    await page.goto(`http://127.0.0.1:${SITE_PORT}`, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: /try it live/i}).click()
    const command = await page.getByText(/npx @conciv\/cli connect --token/).textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: `http://127.0.0.1:${SITE_PORT}`,
    })
    await expect
      .poll(
        () =>
          page
            .getByText(/connected/i)
            .first()
            .isVisible(),
        {timeout: 30_000},
      )
      .toBe(true)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => input.isVisible(), {timeout: 15_000}).toBe(true)
    await input.fill('hello')
    await input.press('Enter')
    await expect.poll(() => page.getByText('hello from e2e').first().isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
  }, 180_000)
})
```

Known frictions to resolve while making it pass (budgeted into this task): the pair panel is origin-hardcoded to conciv.dev for the copy text (fine — the test drives `runConnect` directly with `--origin`); LNA is only enforced when the page origin is _secure_-public — with an http origin Chrome may hard-block instead of prompt, in which case serve wrangler behind the self-signed-https recipe from the spike (https server proxying wrangler, `ignoreHTTPSErrors: true`) or relax to `--origin` + loopback-origin coverage and keep the LNA-permission variant as the embed-level test from the spike. Timebox; transport-level LNA proof already exists from the spike.

- [ ] **Step 2: Run it** — `cd apps/site && pnpm vitest run test/live-connect.it.test.ts` (needs `pnpm turbo run build` for cli/core/embed first). Expected: PASS.

- [ ] **Step 3: Wire `test` into turbo for the site** (site `package.json` test script runs both unit + it files; `turbo run test` already dependsOn build). Verify: `pnpm turbo run test --filter=conciv-site`.

- [ ] **Step 4: Commit**

```bash
git add apps/site/test/live-connect.it.test.ts apps/site/package.json pnpm-lock.yaml
git commit -m "test(site): e2e — pair token, LNA permission, live chat turn" -- apps/site pnpm-lock.yaml
```

---

### Task 6: Release + docs wrap-up

**Files:**

- Create: `.changeset/live-widget-connect.md`
- Modify: `README.md` (a short "Try it live" section pointing at conciv.dev), issue #58 comment (manual, after merge)

- [ ] **Step 1: Changeset**

```md
---
'@conciv/cli': patch
---

`conciv connect` — pair the agent CLI on your machine with the conciv widget on conciv.dev (token-gated, loopback-only core, CORS-locked to conciv.dev).
```

(One entry moves the whole fixed `@conciv/*` set.)

- [ ] **Step 2: Full gate**

```bash
pnpm typecheck && pnpm build && pnpm test
pnpm exec fallow audit --changed-since main --format json
```

Fix anything INTRODUCED (dead code, unused deps — the `@conciv/embed` site devDep may need the trace treatment: `pnpm exec fallow dead-code --trace-dependency @conciv/embed` before touching it).

- [ ] **Step 3: Commit + hand to user**

```bash
git add .changeset/live-widget-connect.md README.md
git commit -m "chore: changeset + docs for live-widget connect" -- .changeset README.md
```

DO NOT PUSH. The user verifies the flow locally (Task 4 Step 5 recipe) before any PR.

---

## Deferred (do not build now)

- Stage-2 relay (Durable Object) — spec section "Stage 2".
- Track A revival — spec section "Track A: parked".
- Claiming the bare `conciv` npm name (nicer `npx conciv connect`) — needs an ownership decision.
