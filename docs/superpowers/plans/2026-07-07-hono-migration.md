# Hono Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `h3`, `srvx`, and `crossws` from every package under `packages/*`, replacing them with Hono, `@hono/node-server` (server + native WebSocket), `hono/streaming` for SSE, and end-to-end typed RPC (`hc<AppType>`) for the widget→core boundary.

**Architecture:** Every `registerXRoutes(app): void` becomes a factory returning a chained Hono sub-app; core composes them with `.route(prefix, sub)` and exports `AppType`. `@conciv/api-client` is rewritten over `hc<AppType>` (type-only core import) with its return type pinned to a new `SessionClient` interface in `@conciv/protocol`, keeping runtime zod response validation. Extensions keep mounting sub-apps, now Hono.

**Tech Stack:** hono ^4.12.28, @hono/node-server ^2.0.8, @hono/zod-validator ^0.8.0, ws ^8.21.0, zod ^4.4.3 (existing), vitest + Playwright (existing).

**Spec:** `docs/superpowers/specs/2026-07-07-hono-migration-design.md`

## Global Constraints

- Repo style: functions not classes, no IIFEs, ZERO code comments (lint deletes them), no `any`/`as`/`@ts-ignore`/non-null `!`, no `else` where avoidable, oxfmt (no semicolons, single quotes, printWidth 120).
- Build/typecheck/test via turbo from repo root: `pnpm turbo run build --filter=<pkg>`, `pnpm typecheck`, `pnpm test`. Never hand-rebuild `dist/`.
- Commit with pathspec always: `git commit -m "..." -- <paths>`. If prek aborts with `next-index-*.lock.lock`, run `pnpm format` then `git commit --no-verify -- <paths>`.
- Example apps under `apps/*`: DO NOT TOUCH.
- No new npm deps beyond: `hono`, `@hono/node-server`, `@hono/zod-validator`, `ws`, `@types/ws` (user-approved in spec).
- End state: `grep -rn "h3\|srvx\|crossws" packages --include=*.ts --include=*.json | grep -v node_modules` → empty.
- MCP route (`/api/mcp`) keeps `WebStandardStreamableHTTPServerTransport` — protocol unchanged.
- `zValidator` validates inputs only; every JSON handler assigns its payload to a protocol-typed local, then `return c.json(payload)` — this makes hc-inferred types exactly the protocol types.
- streamSSE callbacks must never throw after streaming starts (Hono `onError` won't fire); resolve on abort instead.

## Two Landmines (read before any task)

1. **Hono `.route()` copies the sub-app's routes at mount time.** h3's `withBase(prefix, sub.handler)` dispatched dynamically, so routes added to `sub` after mounting still worked. In Hono they will 404. Therefore extension sub-apps are mounted onto the parent **after** `extension.__server()` has registered its routes (Task 7).
2. **Registration order is precedence.** `POST /api/page/open-source` must be mounted **before** the `/api/page/:verb` param routes, or `:verb` matches first and its param validator 400s. The composition in Task 7 encodes this order — do not reorder.

---

### Task 1: `SessionClient` + `RequestMeta` interfaces in protocol

**Files:**

- Modify: `packages/protocol/src/chat-types.ts` (append at end)

**Interfaces:**

- Consumes: existing zod schemas in the same file (`ChatSessionSchema`, `ChatSessionsSchema`, `ChatHistorySchema`, `ChatModelsSchema`, `ChatCommandsSchema`, `ChatToolsSchema`, `ChatLaunchSchema`, `ChatLaunchRequestSchema`, `RenameSessionSchema`, `ResolveRequestSchema`, `ResolveResponseSchema`, `RenameResponseSchema`, `OkSchema`, `PermissionDecisionSchema`, `SessionId`).
- Produces: `type SessionClient`, `type RequestMeta` — Task 9 (extension) imports them from `@conciv/protocol/chat-types`; Task 13 (api-client) pins `defineClient`'s return type to `SessionClient`.

- [ ] **Step 1: Read the schema names**

Open `packages/protocol/src/chat-types.ts`, confirm every schema listed above exists and note exact exported names (they are the ones `packages/api-client/src/api-client.ts` imports today).

- [ ] **Step 2: Append the interfaces**

```ts
export type RequestMeta = Record<string, unknown>

export type SessionClient = {
  sessionId: () => SessionId | null
  setSessionId: (id: SessionId | null) => void
  chatStreamUrl: () => string
  attachUrl: () => string
  chatHeaders: () => Record<string, string>
  resolve: (body?: z.input<typeof ResolveRequestSchema>) => Promise<z.output<typeof ResolveResponseSchema>>
  session: () => Promise<z.output<typeof ChatSessionSchema>>
  sessions: () => Promise<z.output<typeof ChatSessionsSchema>>
  history: () => Promise<z.output<typeof ChatHistorySchema>>
  models: () => Promise<z.output<typeof ChatModelsSchema>>
  commands: () => Promise<z.output<typeof ChatCommandsSchema>>
  tools: () => Promise<z.output<typeof ChatToolsSchema>>
  rename: (body: z.input<typeof RenameSessionSchema>) => Promise<z.output<typeof RenameResponseSchema>>
  launch: (body?: z.input<typeof ChatLaunchRequestSchema>) => Promise<z.output<typeof ChatLaunchSchema>>
  remove: () => Promise<z.output<typeof OkSchema>>
  stop: () => Promise<z.output<typeof OkSchema>>
  permissionDecision: (body: z.input<typeof PermissionDecisionSchema>) => Promise<z.output<typeof OkSchema>>
}
```

If `chat-types.ts` does not already import `z`, add `import {z} from 'zod'` (check first — it almost certainly does since it defines schemas).

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm turbo run typecheck --filter=@conciv/protocol` — expect PASS.

```bash
git commit -m "feat(protocol): SessionClient + RequestMeta client contract" -- packages/protocol/src/chat-types.ts
```

---

### Task 2: Add new dependencies (keep old ones for now)

**Files:**

- Modify: `packages/core/package.json`, `packages/extension/package.json`, `packages/extensions/terminal/package.json`, `packages/extensions/test-runner/package.json`, `packages/harness-testkit/package.json`, `packages/api-client/package.json`

h3/srvx/crossws stay installed until Task 14 so intermediate tasks keep building.

- [ ] **Step 1: Add deps per manifest**

- `core` dependencies: `"hono": "^4.12.28"`, `"@hono/node-server": "^2.0.8"`, `"@hono/zod-validator": "^0.8.0"`, `"ws": "^8.21.0"`; devDependencies: `"@types/ws": "^8.18.1"`.
- `extension` dependencies: `"hono": "^4.12.28"` (its public `.d.ts` references the `Hono` type).
- `extensions/terminal` dependencies: `"hono": "^4.12.28"`, `"@hono/node-server": "^2.0.8"`, `"@hono/zod-validator": "^0.8.0"`.
- `extensions/test-runner` dependencies: `"hono": "^4.12.28"`, `"@hono/zod-validator": "^0.8.0"`.
- `harness-testkit` dependencies: `"@hono/node-server": "^2.0.8"`, `"hono": "^4.12.28"`.
- `api-client` dependencies: `"hono": "^4.12.28"`; devDependencies: `"@conciv/core": "workspace:^"` (type-only import — verify it does NOT land in `dependencies`).

Also inspect `packages/core/package.json` lines ~5–15: there is an array listing `"h3"` and `"srvx"` (bundler externals or similar). Add `"hono"` and `"@hono/node-server"` to it now; the old entries are removed in Task 14.

- [ ] **Step 2: Install + commit**

Run: `pnpm install` — expect lockfile update, no peer warnings for hono/zod.

```bash
git commit -m "chore: add hono ecosystem deps alongside h3 (migration transition)" -- pnpm-lock.yaml packages/core/package.json packages/extension/package.json packages/extensions/terminal/package.json packages/extensions/test-runner/package.json packages/harness-testkit/package.json packages/api-client/package.json
```

---

### Task 3: Core CORS → Hono middleware

**Files:**

- Modify: `packages/core/src/api/cors.ts`
- Test: `packages/core/test/cors.test.ts`, `packages/core/test/api/cors.test.ts`, `packages/core/test/api/cors.it.test.ts` (update imports/harness only where they reference h3/srvx; assertions unchanged)

**Interfaces:**

- Consumes: `CONCIV_SESSION_HEADER` from protocol.
- Produces: `originAllowed(origin: string | null, extra: ReadonlySet<string>): boolean` (unchanged signature — engine.ts and app.ts keep using it) and `corsMiddleware(allowedOrigins?: string[]): MiddlewareHandler` (replaces `registerCors`; `corsHeadersFor` is deleted — the middleware now decorates every response including SSE/attach).

- [ ] **Step 1: Rewrite `cors.ts`**

```ts
import {cors} from 'hono/cors'
import type {MiddlewareHandler} from 'hono'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function isLoopback(value: string): boolean {
  const host = hostnameOf(value)
  return host !== null && LOOPBACK_HOSTS.has(host)
}

export function originAllowed(origin: string | null, extra: ReadonlySet<string>): boolean {
  if (!origin) return true
  return isLoopback(origin) || extra.has(origin)
}

function hostAllowed(host: string | null): boolean {
  if (!host) return true
  const hostname = host.split(':')[0] ?? host
  return LOOPBACK_HOSTS.has(hostname)
}

export function corsMiddleware(allowedOrigins: string[] = []): MiddlewareHandler {
  const extra = new Set(allowedOrigins)
  const corsHandler = cors({
    origin: (origin) => (originAllowed(origin, extra) ? origin : ''),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', CONCIV_SESSION_HEADER],
  })
  return async (c, next) => {
    const origin = c.req.header('origin') ?? null
    if (!originAllowed(origin, extra) || !hostAllowed(c.req.header('host') ?? null)) {
      return c.text('forbidden origin', 403)
    }
    return corsHandler(c, next)
  }
}
```

- [ ] **Step 2: Update the three cors test files**

Where a test builds an h3 app (`new H3()` + `registerCors`), switch to `new Hono()` + `app.use(corsMiddleware(...))` and drive it with `app.request('/path', {headers})` (Hono's built-in test dispatcher — no server needed). Where a test used srvx `serve`, prefer `app.request` unless a real socket is asserted; if a real socket is needed use the Task 12 serve-swap recipe. Keep every assertion identical (status 403, `access-control-allow-*` headers, vary).

- [ ] **Step 3: Run the cors tests**

Run: `pnpm turbo run build --filter=@conciv/protocol && pnpm vitest run packages/core/test/cors.test.ts packages/core/test/api/cors.test.ts packages/core/test/api/cors.it.test.ts --root packages/core` (adjust invocation to the package's `test` script if it differs — check `packages/core/package.json` scripts).
Expected: PASS. Note: core-wide typecheck will FAIL until Task 7 (app.ts still imports the old names) — that is expected mid-migration; only these test files must pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): cors as hono middleware" -- packages/core/src/api/cors.ts packages/core/test
```

---

### Task 4: Core simple routes → chained Hono factories

**Files:**

- Modify: `packages/core/src/api/chat/session-id.ts`, `packages/core/src/api/editor/editor.ts`, `packages/core/src/api/chat/tools-route.ts`, `packages/core/src/api/page/open-source.ts`, `packages/core/src/api/server/server.ts`, `packages/core/src/api/page/page.ts`
- Delete: `packages/core/src/api/sse.ts` (its two consumers are rewritten here and in Task 5)

**Interfaces:**

- Consumes: protocol schemas as today.
- Produces (Task 7 composes these — names must match exactly):
  - `makeEditorRoutes(openInEditor: OpenInEditor)` → routes: `POST /open` (mounted at `/api/editor`)
  - `makeToolsRoute(tools: ChatTool[])` → `GET /` (mounted at `/api/chat/tools`)
  - `makeOpenSourceRoute(deps: {openInEditor: OpenInEditor; root: string})` → `POST /open-source` (mounted at `/api/page` BEFORE page verb routes)
  - `makeServerRoutes(bridge: () => BundlerBridge | undefined)` → all `/api/server/*` (always mounted; 503 when no bridge)
  - `makePageRoutes(deps: {journal: Journal; root: string})` → `{routes: Hono-chain, ask: PageBus['ask']}`
  - `sessionIdFromHeaders(headers: Headers): string | null` (unchanged signature, HTTPException inside)

- [ ] **Step 1: `session-id.ts`**

```ts
import {HTTPException} from 'hono/http-exception'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'

export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPException(400, {message: 'invalid session id (must be ours)'})
  return raw
}
```

- [ ] **Step 2: `editor.ts`**

```ts
import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {EditorOpenSchema} from '@conciv/protocol/editor-types'
import type {OpenInEditor} from '../../editor/open.js'
import {OkSchema} from '@conciv/protocol/chat-types'
import type {z} from 'zod'

export function makeEditorRoutes(openInEditor: OpenInEditor) {
  return new Hono().post('/open', zValidator('json', EditorOpenSchema), (c) => {
    const {file, line} = c.req.valid('json')
    openInEditor(file, line)
    const payload: z.output<typeof OkSchema> = {ok: true}
    return c.json(payload)
  })
}
```

(If `OkSchema` has fields beyond `{ok: boolean}`, mirror its actual output shape — check the schema.)

- [ ] **Step 3: `tools-route.ts`**

```ts
import {Hono} from 'hono'
import type {ChatTool, ChatTools} from '@conciv/protocol/chat-types'

export function makeToolsRoute(tools: ChatTool[]) {
  return new Hono().get('/', (c) => {
    const payload: ChatTools = {tools}
    return c.json(payload)
  })
}
```

- [ ] **Step 4: `open-source.ts`**

```ts
import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {OpenSourceSchema} from '@conciv/protocol/page-types'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'
import type {OpenInEditor} from '../../editor/open.js'

export function makeOpenSourceRoute(deps: {openInEditor: OpenInEditor; root: string}) {
  return new Hono().post('/open-source', zValidator('json', OpenSourceSchema), async (c) => {
    const {frames} = c.req.valid('json')
    const resolved: RawFrame[] = frames
      .filter((f): f is typeof f & {fileName: string} => typeof f.fileName === 'string')
      .map((f) => ({fileName: f.fileName, line: f.line ?? 0, column: f.column, fn: f.fn}))
    const source = await symbolicateFrames(resolved, deps.root)
    if (!source) return c.json({status: 'no-source' as const})
    try {
      deps.openInEditor(source.file, source.line)
      return c.json({status: 'opened' as const})
    } catch {
      return c.json({status: 'failed' as const})
    }
  })
}
```

- [ ] **Step 5: `server/server.ts` — always mounted, 503 guard**

```ts
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'

const ResolveQuerySchema = z.object({spec: z.string(), importer: z.string().optional()})
const FileQuerySchema = z.object({file: z.string()})
const TransformQuerySchema = z.object({url: z.string()})
const ReloadBodySchema = z.object({file: z.string()})
const RestartBodySchema = z.object({force: z.boolean().default(false)})

export function makeServerRoutes(bridge: () => BundlerBridge | undefined) {
  const require = (): BundlerBridge => {
    const found = bridge()
    if (!found) throw new HTTPException(503, {message: 'no bundler bridge'})
    return found
  }
  return new Hono()
    .get('/config', (c) => c.json(require().config()))
    .get('/resolve', zValidator('query', ResolveQuerySchema), async (c) => {
      const {spec, importer} = c.req.valid('query')
      return c.json(await require().resolve(spec, importer))
    })
    .get('/graph', zValidator('query', FileQuerySchema), async (c) => {
      const {file} = c.req.valid('query')
      return c.json(await require().moduleGraph(file))
    })
    .get('/transform', zValidator('query', TransformQuerySchema), async (c) => {
      const {url} = c.req.valid('query')
      return c.json(await require().transform(url))
    })
    .get('/urls', (c) => c.json(require().urls()))
    .post('/reload', zValidator('json', ReloadBodySchema), async (c) => {
      await require().reload(c.req.valid('json').file)
      return c.json({ok: true})
    })
    .post('/restart', zValidator('json', RestartBodySchema), async (c) => {
      await require().restart(c.req.valid('json').force)
      return c.json({ok: true})
    })
}
```

Check the return types of `bridge.config()/resolve()/moduleGraph()/transform()/urls()` — if any returns a non-JSON value (string/Response), keep its current return shape via `c.json`/`c.text` accordingly.

- [ ] **Step 6: `page.ts` — verb routes + SSE via streamSSE**

Keep `makePageBus` exactly as is except: replace both `HTTPError` throws with `HTTPException` (`throw new HTTPException(503, {message: 'no widget connected'})`, `throw new HTTPException(504, {message: 'page did not reply (no widget connected?)'})`). Then replace `registerPageRoutes`:

```ts
import {Hono, type Context} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {streamSSE} from 'hono/streaming'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'

const VerbParamsSchema = z.object({verb: PageQueryKindSchema})

export function makePageRoutes(deps: {journal: Journal; root: string}) {
  const bus = makePageBus()

  const runVerb = async (input: PageQueryInput, verb: PageQuery['kind']) => {
    const data = await bus.ask({kind: verb, ...input})
    if (isMutating(verb)) {
      deps.journal.append({verb, ref: input.ref, selector: input.selector, args: pageArgs(input)}, Date.now())
    }
    if (verb === 'locate' && !data.source && Array.isArray(data.frames)) {
      return {...data, source: await symbolicateFrames(data.frames as RawFrame[], deps.root)}
    }
    return data
  }

  const routes = new Hono()
    .get('/stream', (c) =>
      streamSSE(c, async (stream) => {
        await stream.write(': page-bus open\n\n')
        await new Promise<void>((resolve) => {
          const unsubscribe = bus.subscribe((frame) => void stream.writeSSE({data: JSON.stringify(frame)}))
          stream.onAbort(() => {
            unsubscribe()
            resolve()
          })
        })
      }),
    )
    .post('/reply', zValidator('json', PageReplySchema), async (c) => {
      const {requestId, data} = c.req.valid('json')
      bus.resolve(requestId, data)
      return c.json({ok: true})
    })
    .get('/changes', (c) => c.json(deps.journal.list()))
    .post('/changes/clear', (c) => {
      deps.journal.clear()
      return c.json({ok: true})
    })
    .get('/:verb', zValidator('param', VerbParamsSchema), zValidator('query', PageQueryInputSchema), async (c) =>
      c.json(await runVerb(c.req.valid('query'), c.req.valid('param').verb)),
    )
    .post('/:verb', zValidator('param', VerbParamsSchema), zValidator('json', PageQueryInputSchema), async (c) =>
      c.json(await runVerb(c.req.valid('json'), c.req.valid('param').verb)),
    )

  return {routes, ask: bus.ask}
}
```

Notes for the implementer: (a) GET and POST `/:verb` are two handlers because the validator target differs (query vs json); (b) the `: page-bus open` open-comment framing must match what `packages/widget/src/page/page-bus.ts` expects — check it before changing the frame text; (c) `data.frames as RawFrame[]` exists in the current code — preserve behavior, and if lint rejects the cast, narrow with a type guard instead.

- [ ] **Step 7: Delete `packages/core/src/api/sse.ts`**

`attach.ts` (Task 5) and nothing else must still import it — verify with `grep -rn "sse.js" packages/core/src` after Task 5, not now.

- [ ] **Step 8: Run related tests + commit**

Run: `pnpm vitest run packages/core/test/api/page --root packages/core` (and `open-source.it.test.ts` if runnable standalone; it boots srvx — if so, defer it to Task 8 and note that here).
Expected: page unit tests PASS.

```bash
git commit -m "feat(core): editor/tools/open-source/server/page routes as chained hono factories" -- packages/core/src/api packages/core/test
```

---

### Task 5: Core chat routes → chained Hono factories

**Files:**

- Modify: `packages/core/src/api/chat/permission.ts`, `packages/core/src/api/chat/session.ts`, `packages/core/src/api/chat/launch.ts`, `packages/core/src/api/chat/turn.ts`, `packages/core/src/api/chat/attach.ts`, `packages/core/src/api/chat/chat.ts`

**Interfaces:**

- Consumes: `sessionIdFromHeaders` (Task 4), protocol schemas, existing deps types (`TurnDeps`, `SessionRouteDeps`, `LaunchRouteDeps`, `AttachDeps` — all unchanged).
- Produces: `makeChatRoutes(opts: ChatRouteOpts)` returning the full chained chat sub-app, mounted at `/api/chat` by Task 7. Route paths become RELATIVE: `/session/resolve`, `/session` (GET+DELETE), `/models`, `/commands`, `/history`, `/sessions`, `/sessions/title`, `/stop`, `/launch`, `/permission-decision`, `/ui`, `/` (POST = start turn), `/attach`, `/tools` is NOT here (it stays its own mount at `/api/chat/tools` — see Task 7).

Conversion rules applied to all five route files (all logic bodies stay byte-identical unless listed):

- `registerXRoutes(app, deps): void` → `makeXRoutes(deps)` returning `new Hono().<chain>`.
- Absolute `/api/chat/...` paths → relative paths above.
- `readValidatedBody(event, Schema)` → `zValidator('json', Schema)` + `c.req.valid('json')`.
- `event.req.headers` → `c.req.raw.headers`; `event.req.headers.get('host')` → `c.req.header('host')`; `event.req.url` → `c.req.url`; `event.req.method` → `c.req.method`; `event.req.signal` → `c.req.raw.signal`.
- `throw new HTTPError({status, message})` → `throw new HTTPException(status, {message})` (import from `'hono/http-exception'`).
- Bare object returns → protocol-typed local + `c.json(payload)`.

- [ ] **Step 1: `permission.ts`**

Keep `makePermissionGate` unchanged. Replace `registerPermissionRoutes`:

```ts
export function makePermissionRoutes(gate: PermissionGate) {
  return new Hono().post('/permission-decision', async (c) => {
    const parsed = DecisionBodySchema.safeParse(await c.req.json().catch(() => ({})))
    if (parsed.success && parsed.data.approvalId) gate.resolve(parsed.data.approvalId, parsed.data.approved)
    const payload: z.output<typeof OkSchema> = {ok: true}
    return c.json(payload)
  })
}
```

(The current code tolerates malformed bodies via `safeParse` — the `.catch(() => ({}))` preserves that; `zValidator` would 400 instead, changing behavior.)

- [ ] **Step 2: `session.ts`**

`registerSessionRoutes(app, deps)` → `makeSessionRoutes(deps: SessionRouteDeps)` returning one chain with (in this order): `.post('/session/resolve', zValidator('json', ResolveRequestSchema), …)`, `.get('/session', …)`, `.get('/models', …)`, `.get('/commands', …)`, `.get('/history', …)`, `.get('/sessions', …)`, `.post('/sessions/title', zValidator('json', RenameSessionSchema), …)`, `.delete('/session', …)`, `.post('/stop', …)`. Every handler body is the current one with the conversion rules applied. Typed payload examples the others follow:

```ts
.get('/session', async (c) => {
  const sessionId = sessionIdFromHeaders(c.req.raw.headers)
  if (!sessionId) throw new HTTPException(400, {message: 'no session'})
  ...existing body...
  const payload: ChatSession = {...}
  return c.json(payload)
})
.get('/commands', async (c) => {
  ...
  const origin = `http://${c.req.header('host') ?? '127.0.0.1:3000'}`
  ...
  const payload: ChatCommands = {commands: list.map(...)}
  return c.json(payload)
})
```

`/history` returns `ChatHistory` (`const payload: ChatHistory = ...; return c.json(payload)` — the early returns `return c.json([] satisfies ChatHistory)` need the same typing). `/sessions/title` returns `{ok: true, title: clean}` typed as `z.output<typeof RenameResponseSchema>`.

- [ ] **Step 3: `launch.ts`**

`registerLaunchRoutes` → `makeLaunchRoutes(deps: LaunchRouteDeps)`; route `.post('/launch', zValidator('json', ChatLaunchRequestSchema), …)`; payload typed `ChatLaunch`. Everything below `registerLaunchRoutes` in the file (spawn helpers) is untouched.

- [ ] **Step 4: `turn.ts`**

Everything except `registerTurnRoutes` is untouched. Replace it:

```ts
export function makeTurnRoutes(deps: TurnDeps) {
  const {harness, uiBus} = deps
  const sysText = systemPromptText(deps, harness.capabilities.systemPrompt)

  return new Hono()
    .post('/ui', zValidator('json', UiSpecSchema), (c) => {
      const spec = c.req.valid('json')
      const sessionId = sessionIdFromHeaders(c.req.raw.headers)
      return c.json({renderId: spec.renderId, injected: sessionId ? uiBus.inject(sessionId, spec) : false})
    })
    .post('/', zValidator('json', ChatRequestSchema), async (c) => {
      const sessionId = sessionIdFromHeaders(c.req.raw.headers)
      if (!sessionId) throw new HTTPException(400, {message: 'no session (resolve first)'})
      if (deps.hub.generating(sessionId)) throw new HTTPException(409, {message: 'session busy'})
      if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
        throw new HTTPException(409, {message: 'session busy'})
      }
      try {
        deps.onTurnStart?.(sessionId)
        await ensureChatRecord(deps.store, sessionId, harness.id, deps.cwd)
        await startTurn(deps, sessionId, c.req.valid('json'), sysText)
        const payload: z.output<typeof OkSchema> = {ok: true}
        return c.json(payload)
      } catch (e) {
        releaseLock(deps.stateRoot, sessionId)
        throw e
      }
    })
}
```

Note the validator ordering vs the lock: today `readValidatedBody` runs INSIDE the lock try/catch (invalid body releases the lock). With `zValidator` as middleware, validation happens BEFORE the handler — so an invalid body now 400s without ever acquiring the lock. That is equivalent-or-better; keep it, but confirm no test asserts lock acquisition on invalid bodies.

- [ ] **Step 5: `attach.ts`**

```ts
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

export function makeAttachRoute(deps: AttachDeps) {
  return new Hono().get('/attach', async (c) => {
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session'})
    const abort = new AbortController()
    c.req.raw.signal.addEventListener('abort', () => abort.abort())
    ...existing body unchanged...
    return new Response(toServerSentEventsStream(chunks(), abort), {status: 200, headers: SSE_HEADERS})
  })
}
```

CORS headers are now added by the global cors middleware (Task 3), so the old `sseHeaders(event)` merge is gone.

- [ ] **Step 6: `chat.ts` — compose the chat group**

Keep `ensureAgentRecord` unchanged. Replace `registerChatRoutes`:

```ts
export function makeChatRoutes(opts: ChatRouteOpts) {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus, {risky: opts.riskyTools})
  const store = opts.store
  const hub = makeTurnHub()

  if (opts.initialSessionId) {
    void ensureAgentRecord({store, harnessKind: opts.harness.id, cwd: opts.cwd}, opts.initialSessionId).catch(() => {})
  }
  void sweepEmptyChatRecords(store, new Set(readLocks(opts.stateRoot).map((l) => l.key))).catch(() => {})

  return new Hono()
    .route('/', makePermissionRoutes(gate))
    .route(
      '/',
      makeSessionRoutes({
        cwd: opts.cwd,
        stateRoot: opts.stateRoot,
        store,
        harness: opts.harness,
        hub,
        claudeHome: opts.claudeHome,
      }),
    )
    .route('/', makeLaunchRoutes({cwd: opts.cwd, harness: opts.harness, store}))
    .route(
      '/',
      makeTurnRoutes({
        cwd: opts.cwd,
        stateRoot: opts.stateRoot,
        harness: opts.harness,
        harnessEnv: opts.harnessEnv,
        claudeHome: opts.claudeHome,
        gate,
        systemPromptFile: opts.systemPromptFile,
        systemPromptText: opts.systemPromptText,
        uiBus,
        store,
        tools: opts.tools,
        onTurnStart: opts.onTurnStart,
        onTurnEnd: opts.onTurnEnd,
        hub,
      }),
    )
    .route('/', makeAttachRoute({cwd: opts.cwd, harness: opts.harness, store, hub, claudeHome: opts.claudeHome}))
}
```

- [ ] **Step 7: Commit**

Core typecheck still fails (app.ts not yet converted) — that's expected until Task 7.

```bash
git commit -m "feat(core): chat routes as chained hono factories" -- packages/core/src/api/chat
```

---

### Task 6: MCP route → factory

**Files:**

- Modify: `packages/core/src/api/mcp/mcp.ts`

**Interfaces:**

- Produces: `makeMcpRoutes(makeCtx, extensionTools?, sessionModel?)` → `POST /` mounted at `/api/mcp` in Task 7. All non-route code in the file is untouched.

- [ ] **Step 1: Convert `registerMcpRoutes`**

```ts
export function makeMcpRoutes(
  makeCtx: (sessionId: string) => ConcivToolContext,
  extensionTools: ExtensionServerTool[] = [],
  sessionModel: (sessionId: string) => string | null = () => null,
) {
  return new Hono().post('/', async (c) => {
    const sessionId = sessionIdFromHeaders(c.req.raw.headers) ?? ''
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, model: sessionModel(sessionId)}
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await buildServer(ctx, extensionTools, request).connect(transport)
    return transport.handleRequest(c.req.raw)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(core): mcp route as hono factory" -- packages/core/src/api/mcp/mcp.ts
```

---### Task 7: extension-app + app.ts composition + `AppType`

**Files:**

- Modify: `packages/core/src/extension-app.ts`, `packages/core/src/app.ts`
- Modify: core public entry (find with `grep -n "export" packages/core/src/index.ts` or the file named in core `package.json` `exports`) — add `export type {AppType}`.
- Test: `packages/core/test/api/extension-app.it.test.ts` (update to Hono + late-mount semantics)

**Interfaces:**

- Consumes: every `makeXRoutes` factory from Tasks 4–6, `corsMiddleware` from Task 3.
- Produces: `makeApp(opts: MakeAppOpts): Promise<MadeApp>` with `MadeApp = {app: AppType; disposers: ...; extensionContexts: ...}`, and `export type AppType`. Task 8 (engine) consumes `app.fetch`; Task 13 (api-client) consumes `AppType`.

- [ ] **Step 1: Rewrite `extension-app.ts` (LANDMINE 1)**

`.route()` copies routes at call time, so the sub-app is returned UNMOUNTED; app.ts mounts it after the extension registers its routes:

```ts
import {Hono} from 'hono'

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeExtensionApp(originAllowed: (origin: string | null) => boolean): Hono {
  const sub = new Hono()
  sub.use(async (c, next) => {
    if (!originAllowed(c.req.header('origin') ?? null)) return c.text('forbidden origin', 403)
    await next()
  })
  return sub
}
```

- [ ] **Step 2: Rewrite `app.ts` composition**

Order of operations inside `makeApp` (bodies of the session/harness/tool wiring are all unchanged — only app construction moves):

1. Build everything that doesn't need the app: `uiBus`, `store`, `riskyTools`, `chatTurnListeners`, `guard`, `serverSessions`, `serverHarness`.
2. `const page = makePageRoutes({journal: makeJournal(), root: opts.cwd})` (gives `page.ask` for tool ctx AND `page.routes` for composition).
3. Mount extensions on standalone sub-apps: in the existing `mounted = await Promise.all(...)` loop, replace `app: makeExtensionApp(app, extension.name, guard)` with a per-extension `const sub = makeExtensionApp(guard)` passed as `app: sub`, and collect `{extensionName, sub}` alongside the existing fields.
4. Compose the typed app in one chained expression:

```ts
const app = new Hono()
  .use(corsMiddleware(opts.allowedOrigins ?? []))
  .route('/api/page', makeOpenSourceRoute({openInEditor: opts.openInEditor, root: opts.cwd}))
  .route('/api/page', page.routes)
  .route('/api/editor', makeEditorRoutes(opts.openInEditor))
  .route('/api/chat/tools', makeToolsRoute(toolList))
  .route('/api/chat', makeChatRoutes({...same opts object as today...}))
  .route('/api/mcp', makeMcpRoutes(makeToolCtx, extensionTools, sessionModel))
  .route('/api/server', makeServerRoutes(() => opts.bridge))
```

LANDMINE 2 encoded here: open-source BEFORE `page.routes` (the `/:verb` param route), and `/api/chat/tools` BEFORE `/api/chat` (so the chat chain's relative routes can't shadow it — `tools` is not a chat-chain path today, but the mount order makes it unambiguous).

Note `toolList`, `extensionTools`, `makeToolCtx`, `sessionModel` must be computed BEFORE the chain (today `registerToolsRoute` is called late — hoist the `toolList` construction above the chain; it has no app dependency).

5. After the chain, mount extension sub-apps (runtime mutation, type already fixed):

```ts
mounted.forEach((entry) => app.route(`/api/ext/${slug(entry.extensionName)}`, entry.sub))
```

6. Export the type and the result:

```ts
export type AppType = typeof app // hoist via: function composeRoutes(...) pattern if `typeof` of a local is awkward — the clean form is to extract step 4 into `function composeRoutes(deps)` at module scope and `export type AppType = ReturnType<typeof composeRoutes>`
export type MadeApp = {
  app: AppType
  disposers: (() => void | Promise<void>)[]
  extensionContexts: Record<string, unknown>
}
```

Extract step 4 into a module-scope `composeRoutes(deps)` function taking the prepared pieces (`allowedOrigins`, `page`, `openInEditor`, `cwd`, `toolList`, chat opts, mcp args, `bridge` getter) so `export type AppType = ReturnType<typeof composeRoutes>` is a static type. `makeApp` calls it.

- [ ] **Step 3: Export `AppType` from the core public entry**

In core's index (whatever `exports["."]` points at): `export type {AppType} from './app.js'`.

- [ ] **Step 4: Core typecheck + unit tests**

Run: `pnpm turbo run typecheck --filter=@conciv/core`
Expected: PASS — this is the milestone where core compiles again. `engine.ts`/`ws.ts` still import srvx/crossws (Task 8) but srvx is still installed, so it compiles.

Update `packages/core/test/api/extension-app.it.test.ts`: it exercises mounting + origin guard; adapt construction to `makeExtensionApp(guard)` + `parent.route(prefix, sub)` mounted AFTER registering test routes, assertions unchanged. Run it plus the page/cors tests:
`pnpm vitest run packages/core/test --root packages/core` — expect PASS except `ws.it.test.ts` (Task 8) — if it fails here, note it and continue.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): chained app composition with exported AppType, late extension mounts" -- packages/core/src/app.ts packages/core/src/extension-app.ts packages/core/src/index.ts packages/core/test
```

---

### Task 8: engine.ts + delete ws.ts + core srvx tests

**Files:**

- Modify: `packages/core/src/engine.ts`
- Delete: `packages/core/src/api/ws.ts`
- Test: `packages/core/test/api/ws.it.test.ts` (rewrite over @hono/node-server), `packages/core/test/api/open-source.it.test.ts` + any core test importing srvx (swap recipe below)

**Interfaces:**

- Consumes: `makeApp` (Task 7), `originAllowed` (Task 3).
- Produces: `start(opts: StartOpts): Promise<Engine>` — signature unchanged. WebSocket upgrade now flows through the app (`upgradeWebSocket` routes registered by extensions), wired via `serve({websocket})`.

- [ ] **Step 1: Rewrite server boot in `engine.ts`**

```ts
import {serve} from '@hono/node-server'
import {WebSocketServer} from 'ws'
```

Replace lines 74–89 (`serve` → return) with:

```ts
const requestedPort = opts.port ?? (await getPort())
const wss = new WebSocketServer({noServer: true})
const server = serve({fetch: app.fetch, port: requestedPort, hostname: '127.0.0.1', websocket: {server: wss}})
await new Promise<void>((resolve) => server.once('listening', resolve))
const address = server.address()
const port = typeof address === 'object' && address !== null ? address.port : requestedPort
portRef.port = port
return {
  port,
  cfg,
  extensionContexts,
  stop: async () => {
    await Promise.all(disposers.map((dispose) => dispose()))
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  },
}
```

Delete the `portOf` helper, the `attachWebSocket` import + call, and the now-unused `originAllowed` import (origin guard for WS runs in the extension sub-app middleware). `closeAllConnections` is critical: SSE/WS connections otherwise hang `stop()` forever (srvx's `close(true)` did this before).

If `serve`'s v2 option types differ from `{fetch, port, hostname, websocket}` (check `node_modules/@hono/node-server/dist/index.d.ts`), adapt to the actual signature — the docs-blessed shape is `serve({fetch, websocket: {server: wss}})`.

- [ ] **Step 2: Delete `packages/core/src/api/ws.ts`** and remove any import of it.

- [ ] **Step 3: srvx test swap recipe (applies to every test file importing srvx)**

Before:

```ts
import {serve, type Server} from 'srvx'
const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
await server.ready()
const base = new URL(server.url ?? '').origin
...
await server.close(true)
```

After:

```ts
import {serve} from '@hono/node-server'
const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
await new Promise<void>((resolve) => server.once('listening', resolve))
const address = server.address()
const base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
...
if ('closeAllConnections' in server) server.closeAllConnections()
await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
```

Apply to: `packages/core/test/api/ws.it.test.ts` (also swap its crossws/`defineWebSocketHandler` usage to `upgradeWebSocket` from `@hono/node-server` + `websocket: {server: new WebSocketServer({noServer: true})}` in serve opts), `packages/core/test/api/open-source.it.test.ts`, and any other core test the grep in Step 4 finds.

- [ ] **Step 4: Verify + commit**

Run: `grep -rn "srvx\|crossws" packages/core/src packages/core/test` → expect ONLY package.json references remain (none in ts).
Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS.

```bash
git commit -m "feat(core): boot on @hono/node-server with native ws, drop srvx/crossws wiring" -- packages/core/src packages/core/test
```

---

### Task 9: Extension package contract

**Files:**

- Modify: `packages/extension/src/types.ts`, `packages/extension/package.json`
- Check: `grep -rn "from 'h3'\|api-client" packages/extension/src` for any other reference.

**Interfaces:**

- Produces: `ServerApi.app: Hono`; `SessionClient`/`RequestMeta` re-imported from protocol. Tasks 10–11 (extensions) compile against this.

- [ ] **Step 1: `types.ts`**

Replace `import type {H3} from 'h3'` with `import type {Hono} from 'hono'`; `app: H3` → `app: Hono` in `ServerApi`. Replace `import type {RequestMeta, SessionClient} from '@conciv/api-client'` with `import type {RequestMeta, SessionClient} from '@conciv/protocol/chat-types'`. If `types.ts` re-exports these names publicly today, keep re-exporting them (same names) so extension authors' imports don't break.

- [ ] **Step 2: `package.json`**

Remove `"h3"` and `"@conciv/api-client"` from dependencies (hono was added in Task 2). Run `pnpm install`.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm turbo run typecheck --filter=@conciv/extension` — expect PASS.

```bash
git commit -m "feat(extension)!: ServerApi.app is hono; client types from protocol" -- packages/extension pnpm-lock.yaml
```

---

### Task 10: test-runner extension server

**Files:**

- Modify: `packages/extensions/test-runner/src/server.ts`, `packages/extensions/test-runner/src/runner/sse.ts`, `packages/extensions/test-runner/package.json` (remove h3)

- [ ] **Step 1: `runner/sse.ts` → streamSSE helper**

```ts
import type {Context} from 'hono'
import {streamSSE} from 'hono/streaming'

export function sseStream(
  c: Context,
  openComment: string,
  start: (emit: (data: unknown) => void) => () => void,
): Response {
  return streamSSE(c, async (stream) => {
    await stream.write(`: ${openComment}\n\n`)
    await new Promise<void>((resolve) => {
      const unsubscribe = start((data) => void stream.writeSSE({data: JSON.stringify(data)}))
      stream.onAbort(() => {
        unsubscribe()
        resolve()
      })
    })
  })
}
```

(CORS headers come from the sub-app/parent middleware now; the hand-rolled cors merge is gone.)

- [ ] **Step 2: `server.ts`**

Replace the h3 imports with `{HTTPException}` from `'hono/http-exception'`, `{zValidator}` from `'@hono/zod-validator'`. Replace the `onError` middleware with try/catch middleware (h3's `onError` has no route-scoped Hono equivalent that survives `.route()` mounting):

```ts
server.app.use(async (c, next) => {
  try {
    await next()
  } catch (error) {
    const original = error instanceof Error && error.cause !== undefined ? error.cause : error
    if (!isRunnerUnavailable(original)) throw error
    return c.json({available: false, error: original.message}, 422)
  }
})
```

(`isRunnerUnavailable` must narrow to a type with `.message` — check `runner/contract.ts`; if it narrows to a class/shape with `message: string` this compiles as-is.)

Routes:

```ts
server.app.get('/stream', (c) =>
  sseStream(c, 'test-runner open', (emit) => {
    emit(manager.emitSnapshot())
    return manager.subscribeRaw(emit)
  }),
)
server.app.get('/list', zValidator('query', ListQuerySchema), async (c) =>
  c.json(await manager.list(c.req.valid('query').failed === '1')),
)
server.app.get('/status', (c) => c.json(manager.status()))
server.app.get('/ui', async (c) => c.json(await manager.openUiServer()))
server.app.post('/run', zValidator('json', RunArgsSchema), async (c) => c.json(await manager.run(c.req.valid('json'))))
server.app.post('/stop', async (c) => {
  await manager.stop()
  return c.json({ok: true})
})
```

(Check whether `manager.list`/`status`/`openUiServer`/`run` are sync or async and drop `await` where sync.)

- [ ] **Step 3: Remove `"h3"` from `packages/extensions/test-runner/package.json`**, `pnpm install`.

- [ ] **Step 4: Test + commit**

Run: `pnpm turbo run test --filter=@conciv/extension-test-runner`
Expected: PASS.

```bash
git commit -m "feat(test-runner): hono routes + streamSSE" -- packages/extensions/test-runner pnpm-lock.yaml
```

---

### Task 11: terminal extension server (WebSocket)

**Files:**

- Modify: `packages/extensions/terminal/src/server.ts`, `packages/extensions/terminal/test/helpers.ts`, `packages/extensions/terminal/package.json` (remove h3, crossws)

**Interfaces:**

- Consumes: `upgradeWebSocket` from `@hono/node-server`, `ServerApi.app: Hono` (Task 9).

- [ ] **Step 1: HTTP routes in `server.ts`**

Same conversion rules as Task 5 (zValidator json, HTTPException, `c.req.raw.headers` into `requireSession`, `new URL(c.req.url).origin`). `/state` returns `const payload: TerminalState = {...}; return c.json(payload)`; `/open` + `/close` return `c.json({alive: true|false})`. The `/mirror` SSE route becomes:

```ts
server.app.get('/mirror', async (c) => {
  const sessionId = requireSession(c.req.raw.headers)
  const token = await server.sessions.resumeToken(sessionId)
  const transcriptMessages = server.harness.transcriptMessages
  if (!token || !transcriptMessages) throw new HTTPException(404, {message: 'no transcript'})
  return streamSSE(c, async (stream) => {
    await new Promise<void>((resolve) => {
      const stop = watchMirror({messages: () => transcriptMessages(token)}, (payload) => {
        void stream.writeSSE({data: JSON.stringify(payload)})
      })
      stream.onAbort(() => {
        stop()
        resolve()
      })
    })
  })
})
```

(Read the current `/mirror` body lines 109–131 first; keep `watchMirror` semantics exactly — the old `try/catch controller.enqueue` failure path is covered by onAbort.)

- [ ] **Step 2: `/tty` WebSocket route — per-connection closure replaces the `WeakMap<Peer>`**

```ts
import {upgradeWebSocket} from '@hono/node-server'

server.app.get(
  '/tty',
  upgradeWebSocket((c) => {
    const url = new URL(c.req.url)
    let detach: (() => void) | null = null
    const sessionOf = () => ttySessions.get(url.searchParams.get('session') ?? '')
    return {
      onOpen(_event, ws) {
        const session = sessionOf()
        if (!session) {
          ws.close(4404, 'no terminal for session')
          return
        }
        const cols = Number(url.searchParams.get('cols'))
        const rows = Number(url.searchParams.get('rows'))
        if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 1 && rows > 1) session.resize(cols, rows)
        const sink: TtySink = {
          data: (chunk) => ws.send(chunk),
          control: (frame) => ws.send(JSON.stringify(frame)),
        }
        detach = session.attach(sink)
      },
      onMessage(event) {
        const session = sessionOf()
        if (!session) return
        const text = typeof event.data === 'string' ? event.data : ''
        if (text && !applyControl(session, parseControl(text), text)) session.write(text)
      },
      onClose() {
        detach?.()
        detach = null
      },
    }
  }),
)
```

Delete `sessionFromPeer`, the `detachments` WeakMap, and the `Peer`/crossws import. Check what type `sink.data`'s `chunk` is — the old code wrapped with `Buffer.from(chunk)`; `ws.send` accepts string/ArrayBuffer/Uint8Array, so send `Buffer.from(chunk)` if chunk is not already one of those (keep old behavior: `data: (chunk) => ws.send(Buffer.from(chunk))` if `Buffer.from` was load-bearing for the type).

- [ ] **Step 3: `test/helpers.ts`** — apply Task 8's srvx swap recipe AND pass `websocket: {server: new WebSocketServer({noServer: true})}` (import `WebSocketServer` from `ws`; add `ws` + `@types/ws` to terminal devDependencies) since these ITs exercise `/tty`.

- [ ] **Step 4: Remove `"h3"`, `"crossws"` from terminal package.json**, `pnpm install`.

- [ ] **Step 5: Test + commit**

Run: `pnpm turbo run test --filter=@conciv/extension-terminal`
Expected: PASS (these are real PTY/WS integration tests; if the suite requires the widget bundle, rebuild first per repo rules).

```bash
git commit -m "feat(terminal)!: hono ws via @hono/node-server upgradeWebSocket" -- packages/extensions/terminal pnpm-lock.yaml
```

---

### Task 12: harness-testkit + plugin test off srvx

**Files:**

- Modify: `packages/harness-testkit/src/create-testkit.ts`, `packages/harness-testkit/package.json` (remove srvx), `packages/plugin/test/widget-inject.it.test.ts`

- [ ] **Step 1: `create-testkit.ts`** — apply the Task 8 swap recipe to lines 4 + 68–70 and the `cleanup` close call. `BootedApp.fetch` type stays `(request: Request) => Response | Promise<Response>` — @hono/node-server accepts it.

- [ ] **Step 2: `widget-inject.it.test.ts`** — same recipe.

- [ ] **Step 3: Remove `"srvx"` from harness-testkit package.json**, `pnpm install`.

- [ ] **Step 4: Test + commit**

Run: `pnpm turbo run test --filter=@conciv/harness-testkit --filter=@conciv/plugin`
Expected: PASS.

```bash
git commit -m "feat(harness-testkit): serve on @hono/node-server" -- packages/harness-testkit packages/plugin/test pnpm-lock.yaml
```

---

### Task 13: api-client over hc + type pins

**Files:**

- Delete: `packages/api-client/src/transport.ts`
- Modify: `packages/api-client/src/api-client.ts`
- Test: `packages/api-client/test/api-client.test.ts` (existing behavior tests) + new type-pin test in the same file

**Interfaces:**

- Consumes: `AppType` (type-only) from `@conciv/core` (built dist — core is a devDep as of Task 2), `SessionClient` from protocol (Task 1).
- Produces: `defineClient(opts: {apiBase: string}): SessionClient & {sessionId; setSessionId}` — the exact surface every widget/terminal/testkit call site already uses. Keep exporting `apiError`/`ApiError`. Re-export `SessionClient`/`RequestMeta` from protocol (existing importers). First check `grep -rn "createTransport" packages --include=*.ts* | grep -v node_modules | grep -v api-client/src` — if anything imports it, keep a minimal `createTransport` shim or update that call site; if nothing, delete the export.

- [ ] **Step 1: Rewrite `api-client.ts`**

```ts
import {createSignal} from 'solid-js'
import {hc} from 'hono/client'
import type {AppType} from '@conciv/core'
import {
  CONCIV_SESSION_HEADER,
  type SessionId,
  type SessionClient,
  ChatSessionSchema,
  ChatSessionsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatCommandsSchema,
  ChatToolsSchema,
  ChatLaunchSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  RenameResponseSchema,
  OkSchema,
} from '@conciv/protocol/chat-types'
import type {z} from 'zod'

export type ApiError = Error & {path: string; status: number}
export function apiError(path: string, status: number): ApiError {
  return Object.assign(new Error(`${path} → ${status}`), {path, status})
}

type Parseable = {ok: boolean; status: number; json: () => Promise<unknown>; url: string}

async function parsed<Output>(
  request: Promise<Parseable>,
  schema: {parse: (value: unknown) => Output},
): Promise<Output> {
  const response = await request
  if (!response.ok) throw apiError(new URL(response.url).pathname, response.status)
  return schema.parse(await response.json())
}

export function defineClient(opts: {apiBase: string}): SessionClient {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)
  const sessionHeaders = (): Record<string, string> => {
    const id = sessionId()
    return id ? {[CONCIV_SESSION_HEADER]: id} : {}
  }
  const base = opts.apiBase.replace(/\/+$/, '')
  const client = hc<AppType>(base, {init: {credentials: 'include'}, headers: sessionHeaders})
  const chat = client.api.chat
  return {
    sessionId,
    setSessionId,
    chatStreamUrl: () => `${base}/api/chat`,
    attachUrl: () => `${base}/api/chat/attach`,
    chatHeaders: sessionHeaders,
    resolve: (body?: z.input<typeof ResolveRequestSchema>) =>
      parsed(chat.session.resolve.$post({json: body ?? {}}), ResolveResponseSchema),
    session: () => parsed(chat.session.$get(), ChatSessionSchema),
    sessions: () => parsed(chat.sessions.$get(), ChatSessionsSchema),
    history: () => parsed(chat.history.$get(), ChatHistorySchema),
    models: () => parsed(chat.models.$get(), ChatModelsSchema),
    commands: () => parsed(chat.commands.$get(), ChatCommandsSchema),
    tools: () => parsed(chat.tools.$get(), ChatToolsSchema),
    rename: (body) => parsed(chat.sessions.title.$post({json: body}), RenameResponseSchema),
    launch: (body?) => parsed(chat.launch.$post({json: body ?? {}}), ChatLaunchSchema),
    remove: () => parsed(chat.session.$delete(), OkSchema),
    stop: () => parsed(chat.stop.$post(), OkSchema),
    permissionDecision: (body) => parsed(chat['permission-decision'].$post({json: body}), OkSchema),
  }
}

export type {SessionClient, RequestMeta} from '@conciv/protocol/chat-types'
```

Adjust hc property paths to reality after Task 7 (e.g. `/api/chat/tools` mounted separately still surfaces as `client.api.chat.tools.$get` — verify by typechecking; `$delete`/`$post` with no body may need `{}` or `undefined` args depending on hc's signature). If `hc`'s `headers`-as-function or `ClientResponse.url` isn't available in hono 4.12, fall back to passing `{headers: sessionHeaders()}` per call via each method's second arg, and derive `path` for `apiError` from a string constant per route.

- [ ] **Step 2: Delete `transport.ts`** and fix any lingering import (`grep -rn "transport.js" packages/api-client packages/widget --include=*.ts*`). The `eventSource` helper it exported: check who uses it (`grep -rn "eventSource" packages --include=*.ts* | grep -v node_modules`); if used, move it onto the object `defineClient` returns or a standalone export `eventSource(url: string)` — match the call sites.

- [ ] **Step 3: Type-pin test (drift guard)**

Append to `packages/api-client/test/api-client.test.ts`:

```ts
import {expectTypeOf} from 'vitest'
import type {InferResponseType} from 'hono/client'
import {hc} from 'hono/client'
import type {AppType} from '@conciv/core'
import type {z} from 'zod'
import {ChatSessionsSchema, ChatSessionSchema, OkSchema} from '@conciv/protocol/chat-types'

const pin = hc<AppType>('http://x')

test('hc response types match protocol schemas', () => {
  expectTypeOf<InferResponseType<typeof pin.api.chat.sessions.$get>>().toEqualTypeOf<
    z.output<typeof ChatSessionsSchema>
  >()
  expectTypeOf<InferResponseType<typeof pin.api.chat.session.$get>>().toEqualTypeOf<
    z.output<typeof ChatSessionSchema>
  >()
  expectTypeOf<InferResponseType<typeof pin.api.chat.stop.$post>>().toEqualTypeOf<z.output<typeof OkSchema>>()
})
```

If `toEqualTypeOf` fails on semantically-equal but structurally-decorated types (branded ids, optional-vs-undefined), switch to `toMatchTypeOf` in BOTH directions and note why. If a pin reveals a real mismatch, fix the SERVER payload typing (Task 5/7), not the schema.

- [ ] **Step 4: Run + commit**

Run: `pnpm turbo run build --filter=@conciv/core && pnpm turbo run test --filter=@conciv/api-client`
Expected: PASS (existing api-client tests hit a real local server per repo rules — they should pass unchanged since the wire format is identical).

```bash
git commit -m "feat(api-client)!: typed hc client pinned to protocol SessionClient" -- packages/api-client
```

---

### Task 14: Remove h3/srvx/crossws + full gates

**Files:**

- Modify: `packages/core/package.json` (remove `"h3"`, `"srvx"`, `"crossws"` from deps AND from the externals array noted in Task 2)

- [ ] **Step 1: Remove the deps**, `pnpm install`.

- [ ] **Step 2: Final grep gate**

Run: `grep -rn "h3\|srvx\|crossws" packages --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules | grep -v dist`
Expected: EMPTY output. (Beware incidental substring hits like `sha3`/`h3x` — inspect anything that appears; only actual references count, but the goal is zero.)

- [ ] **Step 3: Full gates**

Run in order, all from repo root:

1. `pnpm typecheck` — PASS
2. `pnpm build` — PASS
3. `pnpm test` — PASS (widget ITs load the PREBUILT bundle: `pnpm turbo run build --filter=@conciv/widget --filter=@conciv/core` happens via turbo dependsOn, but if any widget IT fails on stale bundle, rebuild explicitly first)
4. `pnpm lint` && `pnpm format:check` — PASS
5. `pnpm exec fallow audit --changed-since main --format json` — fix everything flagged INTRODUCED (expected findings: none; deleted files/deps appear as cleanups). Before deleting any export fallow calls dead, verify with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat!: complete h3+srvx+crossws removal (hono everywhere)" -- packages pnpm-lock.yaml
```

- [ ] **Step 5: End-to-end smoke (verify skill)**

Boot an example app dev server (`pnpm dev` in the repo's usual demo app), hard-reload the browser, and exercise: chat turn (SSE), session list, terminal open (WS `/tty`), page tools. This is the runtime surface the migration touched; tests alone don't count as done per repo verification rules. Kill the dev server only via `pkill -f vite` or `lsof -ti tcp:PORT -sTCP:LISTEN`.

---

## Task-order dependency notes

- Tasks 1–2 first (types + deps). Tasks 3–6 are core file conversions and can run in any order relative to each other, but 7 requires ALL of 3–6. Task 8 requires 7. Task 9 requires 2; Tasks 10–11 require 9 (and 8 for terminal ITs to boot). Task 12 requires 8. Task 13 requires 7 (built core dist). Task 14 last.
- Core does NOT typecheck between Tasks 3 and 7 — this is planned; per-task verification during that window is per-file vitest only.
