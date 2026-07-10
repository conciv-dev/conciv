# Widget Rewrite Plan 2/4: `@conciv/client` + `@conciv/storage-history` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two client-plane data packages the `apps/conciv` router app (plan 3) will consume: `@conciv/client` (typed oRPC data access + TanStack Query option factories + the `useChat` connection bridge, ZERO UI) and `@conciv/storage-history` (the Web-Storage-persisted `@tanstack/history` implementation), plus the two enabling changes beneath them (native `MESSAGES_SNAPSHOT` in `chat.attach`, `makeRpcClient` re-homed to `@conciv/contract`).

**Architecture:** `@conciv/contract` gains the typed client factory (`makeRpcClient`) so client, harness-testkit, and extension-testkit all share one factory with no package cycle. Core's `chat.attach` first chunk becomes a native TanStack AI `MESSAGES_SNAPSHOT` so `useChat` applies history with zero client code. `@conciv/client` is then thin: `makeQueryUtils` (the official `@orpc/tanstack-query` utils), `chatConnection` (a framework-free `SubscribeConnectionAdapter`: subscribe = `chat.attach` iterator, send = `chat.send`), and `useChatSession` (a one-expression Solid hook over `useChat`). `@conciv/storage-history` mirrors `createMemoryHistory`'s entries/index model with a persist-on-mutation storage round-trip.

**Tech Stack:** oRPC 1.14.x (`@orpc/client`, `@orpc/tanstack-query`), `@tanstack/ai-solid` 0.14.x (`useChat`, `ConnectionAdapter`), `@tanstack/history` 1.162.x, `@tanstack/solid-query` v5 (test-side), vitest, `@conciv/harness-testkit` fixtures.

**Spec:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md` (v3.3 as amended). **Plan 1 (DONE):** `docs/superpowers/plans/2026-07-09-widget-rewrite-1-core-foundations.md` — contract v3 in `packages/contract/src/contract.ts`, `RpcDeps` in `packages/core/src/rpc/router.ts`, the route-disposition ledger. This plan is written against those real signatures.

## Global Constraints

- Functions, not classes. ZERO code comments in TS. No `any`/`as`/non-null `!`. No IIFEs. No barrel files beyond package entrypoints. oxfmt style (no semicolons, single quotes, no bracket spacing).
- Tests live under `test/`, NEVER `src/`. No test-only APIs in prod code. No stubs/mocks — real served core apps via `@conciv/harness-testkit`, real typed oRPC clients, wire-level ITs.
- Build/typecheck via turbo: `pnpm turbo run build --filter=<pkg>`, `pnpm typecheck`. Commit with pathspec always: `git commit -m "..." -- <paths>`.
- BREAK OLD STUFF FREELY mid-plan; only Task 7's gates bind. Known red that does NOT gate: `packages/core/test/api/mcp/claude-image.it.test.ts` (pre-existing live-LLM flake).
- `pnpm exec fallow audit --changed-since main --format json` clean of INTRODUCED findings before finishing; cyclomatic complexity ≤ 4 on new functions.
- New deps in this plan are all spec-named and pre-approved: `@orpc/tanstack-query`, `@tanstack/solid-query`, `@tanstack/history`, `@tanstack/ai-solid`, `@orpc/client` (into contract). NOTHING else without asking.
- Both new packages join the fixed `@conciv/*` version set (currently `0.0.7`) and `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`; both get `homepage: https://conciv.dev` + `repository` block with `directory`, publint/attw scripts (mirror `packages/contract/package.json`).
- Every Solid-adjacent vitest config pins `test: {environment: 'node'}`.
- drizzle stays EXACT `1.0.0-rc.4`; nothing in this plan touches `@conciv/db`.

## Verified API facts (2026-07-10, against installed node_modules — do NOT re-derive)

- `@orpc` line installed at `1.14.7`; repo pins `^1.14.7`. `@orpc/tanstack-query` and `@tanstack/solid-query` are NOT yet installed (new).
- `@tanstack/history` `1.162.0` is in the pnpm store (transitively). `RouterHistory`, `createHistory(opts)`, `parseHref(href, state)`, `ParsedHistoryState = HistoryState & {key?; __TSR_key?; __TSR_index: number}` — see `node_modules/.pnpm/@tanstack+history@1.162.0/node_modules/@tanstack/history/dist/esm/index.d.ts`. `createHistory` opts: `getLocation, getLength, pushState(path, state), replaceState(path, state), go(n), back(ignoreBlocker), forward(ignoreBlocker), createHref, getBlockers?, setBlockers?, flush?, destroy?, onBlocked?, notifyOnIndexChange?`. `createHistory` assigns key/`__TSR_index` to states BEFORE calling `pushState`/`replaceState` — the impl stores what it is handed. `createMemoryHistory`'s impl (in `index.js`) is the model: entries array + index, forward-truncate on push, clamp on back/forward/go.
- `@tanstack/ai-solid` 0.14.3: `useChat(options)` where options include `connection: ConnectionAdapter`, `live?: boolean`, `id?`, `initialMessages?`, `onCustomEvent?`, `onError?`, `tools?`. `live: true` subscribes on creation and unsubscribes on cleanup (`dist/use-chat.js` lines 77–88). Return: `messages: Accessor<UIMessage[]>`, `sendMessage`, `error`, `isLoading`, `status`, plus `isSubscribed`/`connectionStatus`/`sessionGenerating` accessors.
- `SubscribeConnectionAdapter` (`@tanstack/ai-client` 0.20.0, re-exported by `@tanstack/ai-solid`): `{subscribe: (abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>; send: (messages: Array<UIMessage> | Array<ModelMessage>, data?: Record<string, any>, abortSignal?: AbortSignal, runContext?) => Promise<void>}`. Providing both `connect` and `subscribe`+`send` throws — pick subscribe mode.
- TanStack AI stream processor natively handles `MESSAGES_SNAPSHOT` (`@tanstack/ai` `dist/esm/activities/chat/stream/processor.js` `handleMessagesSnapshotEvent`): resets stream state, maps each message through `aguiSnapshotMessageToUIMessage`, which passes messages that already carry `parts` (i.e. our `UIMessage`s — `ChatHistory` IS `z.array(z.custom<UIMessage>)`) through unchanged, reconciles tool-calls, emits messages-change. The upstream TYPE of `MessagesSnapshotEvent.messages` is the AG-UI wire `Message[]` (strict, `content` required on user messages), so a `UIMessage[]` payload is runtime-supported but not type-assignable — construct through a `z.custom<StreamChunk>` boundary (see Task 2), never `as`.
- `@orpc/tanstack-query@1.14.7` (published tarball verified): `createTanstackQueryUtils(client)` → per-procedure `.queryOptions({input?, context?, ...})`, `.mutationOptions(...)`, `.experimental_streamedOptions(...)` (append semantics), `.experimental_liveOptions(...)` (latest-value semantics; `experimental_LiveQueryOutput<TOutput>` unwraps the iterator to the yielded type), plus `.key()/.queryKey()/.mutationKey()` helpers. The stable names `liveOptions`/`streamedOptions` DO NOT EXIST in 1.14.7 — use the `experimental_` prefix everywhere. Peer deps: `@orpc/client` EXACT `1.14.7` + `@tanstack/query-core >= 5.80.2` — any future `@orpc/client` bump must move `@orpc/tanstack-query` in lockstep. Solid usage: `useQuery(() => utils.x.queryOptions(...))`.
- `@conciv/harness-testkit` (`packages/harness-testkit/src/testkit.ts`): `createTestkit(harness, boot).setup() → Kit {base, stateRoot, rpc, session(), attach(), chat(), cleanup(), ...}` — boots a REAL served app. `createTestHarness(real)` wraps a harness with a scripted adapter (`__scripted.hold()/release()/scriptToolCall()`); `makeScriptedRun` is internal — for custom fakes copy the `defineHarness` + `makeTextAdapter` + generator pattern from `packages/core/test/api/chat/turn-error-flood.it.test.ts`.
- Core boot pattern for out-of-package ITs: `@conciv/core/app` exports `makeApp` (see `packages/core/package.json` exports); the shape to replicate is `packages/core/test/helpers/boot.ts` (`bootCoreApp` builds `ResolvedConcivConfig` + `makeApp` + dispose).
- Typed errors over the wire: `@orpc/client` throws `ORPCError`; check with `isDefinedError(error)` and `error.code === 'BUSY'` (verify the exact guard export in `node_modules/@orpc/client/dist` before writing the test — plan 1's wire IT `packages/core/src/rpc/wire.it.test.ts` already asserts a BUSY round-trip; copy its pattern).

## Locked public API (user-reviewed 2026-07-10 — do not deviate without a new review)

Decisions locked with the user: (1) native `MESSAGES_SNAPSHOT` in core, not a client-side snapshot bridge; (2) `makeRpcClient` moves to `@conciv/contract` (a `@conciv/client` home would create a turbo package cycle with harness-testkit); (3) explicit-args hooks, NO context provider, NO JSX in `@conciv/client`.

```ts
// @conciv/contract (addition)
export type RpcClient = ContractRouterClient<typeof contract>
export function makeRpcClient(apiBase: string): RpcClient

// @conciv/storage-history (whole surface)
export type WebStorage = Pick<Storage, 'getItem' | 'setItem'>
export function createWebStorageHistory(opts: {storage: WebStorage; key?: string}): RouterHistory

// @conciv/client (whole surface)
export type QueryUtils = ReturnType<typeof makeQueryUtils>
export function makeQueryUtils(client: RpcClient): /* createTanstackQueryUtils(client) */
export type ChatConnectionOptions = {retryDelayMs?: number; onRetry?: (error: unknown) => void}
export function chatConnection(rpc: RpcClient, sessionId: string, options?: ChatConnectionOptions): SubscribeConnectionAdapter
export type UseChatSessionOptions = {
  rpc: RpcClient
  sessionId: string
  onCustomEvent?: (eventType: string, data: unknown, context: {toolCallId?: string}) => void
  onError?: (error: Error) => void
}
export function useChatSession(options: UseChatSessionOptions): UseChatReturn
```

Deliberate non-goals (rationale, binding for the executor):

- NO hooks for sessions/drafts/markers/meta — route components call `useQuery(() => utils.sessions.live.experimental_liveOptions(...))` etc. directly with the official integration; wrapping would re-invent it.
- NO draft debounce/reconciliation logic here — the composer (plan 3) is the owner of the focus rule; `utils.drafts.set.mutationOptions()` is already the whole client story.
- NO approval routing through `useChat`'s native `addToolApprovalResponse` — approvals stay hybrid (render from parts/custom events, decide via `utils.chat.permissionDecision.mutationOptions()`), per the established deadlock finding.
- Reconnect lives in `chatConnection`, NOT in `useChat` (adversarial finding C1, 2026-07-10): the installed `@tanstack/ai-client` sets `connectionStatus: 'disconnected'` with NO retry when a subscription ends, and `ai-solid`'s resubscribe effect tracks only the `live` flag — a constant `live: true` never re-fires. `chat.attach` being snapshot-first is exactly what makes a dumb re-attach loop state-safe: every retry replays settled history + the in-flight turn. The old widget's `attach-connection.ts` did the same with 500 ms delays; `chatConnection.subscribe` carries that loop (Task 4 Step 5), so `useChat` still contains zero reconnect code.
- `page.queries`/`page.reply` stay untouched (plan 4's page package is their consumer).

---

### Task 1: `makeRpcClient` moves to `@conciv/contract`

**Files:**

- Create: `packages/contract/src/client.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/package.json` (dep `@orpc/client`)
- Modify: `packages/harness-testkit/src/session.ts` (import from contract, keep re-export)
- Test: `packages/contract/test/client.test.ts`

**Interfaces:**

- Consumes: `contract` from `packages/contract/src/contract.ts`; `createORPCClient`/`RPCLink` from `@orpc/client` (installed `1.14.7`).
- Produces: `makeRpcClient(apiBase: string): RpcClient` and `RpcClient` exported from `@conciv/contract`. `@conciv/harness-testkit` continues to re-export both (its `testkit.ts` line 15 stays valid), so `extension-testkit`'s `rpc-session-client.ts` and every Kit consumer compile unchanged.

- [ ] **Step 1: Install the dep**

Run: `cd packages/contract && pnpm add '@orpc/client@^1.14.7'`

- [ ] **Step 2: Write the failing test**

`packages/contract/test/client.test.ts` (contract has no server; this pins the factory's URL wiring and the client's type surface — the wire behavior is already covered by core's `wire.it.test.ts` and every testkit consumer):

```ts
import {describe, expect, expectTypeOf, it} from 'vitest'
import type {SessionMeta} from '../src/rows.js'
import {makeRpcClient, type RpcClient} from '../src/client.js'

describe('makeRpcClient', () => {
  it('builds a typed client rooted at <apiBase>/rpc', async () => {
    const requests: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init).url)
      return new Response(JSON.stringify({json: []}), {headers: {'content-type': 'application/json'}})
    }
    try {
      const client = makeRpcClient('http://conciv.test')
      await client.sessions.list(undefined)
      expect(requests[0]).toContain('http://conciv.test/rpc/sessions/list')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('is typed by the contract', () => {
    expectTypeOf<Awaited<ReturnType<RpcClient['sessions']['list']>>>().toEqualTypeOf<SessionMeta[]>()
  })
})
```

(`packages/contract` has NO `vitest.config.ts` — it runs vitest on defaults, which already include `test/**/*.test.ts`, so the new file needs no config work. If the RPC response envelope check makes the first assertion brittle, keep only the URL assertion; the envelope belongs to `@orpc`, not us — the `{json: []}` shape was verified against the installed deserializer.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/contract exec vitest run test/client.test.ts`
Expected: FAIL — cannot resolve `../src/client.js`

- [ ] **Step 4: Implement**

`packages/contract/src/client.ts` (this is `packages/harness-testkit/src/session.ts` lines 1–11 moved verbatim):

```ts
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from './contract.js'

export type RpcClient = ContractRouterClient<typeof contract>

export function makeRpcClient(apiBase: string): RpcClient {
  const link = new RPCLink({url: `${apiBase}/rpc`})
  return createORPCClient(link)
}
```

Append to `packages/contract/src/index.ts`:

```ts
export * from './client.js'
```

Rewrite `packages/harness-testkit/src/session.ts` to consume it (public re-export preserved):

```ts
import {makeRpcClient, type RpcClient} from '@conciv/contract'

export {makeRpcClient, type RpcClient}

export async function resolveSession(apiBase: string, id?: string): Promise<string> {
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve(id ? {id} : {})
  return sessionId
}
```

Then: `cd packages/harness-testkit && pnpm remove @orpc/client @orpc/contract` — `session.ts` was the ONLY `@orpc/*` importer in the package (grep-verified 2026-07-10: `grep -rn "@orpc" packages/harness-testkit/src`), and leaving either stranded is a fallow INTRODUCED unused-dependency finding at Task 7. Re-run the grep to confirm before removing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @conciv/contract exec vitest run test/client.test.ts`
Expected: PASS
Run: `pnpm turbo run build --filter=@conciv/contract --filter=@conciv/harness-testkit && pnpm --filter @conciv/harness-testkit typecheck && pnpm --filter @conciv/extension-testkit typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add packages/contract packages/harness-testkit pnpm-lock.yaml
git commit -m "feat(contract): makeRpcClient typed client factory re-homed from harness-testkit" -- packages/contract packages/harness-testkit pnpm-lock.yaml
```

---

### Task 2: Native `MESSAGES_SNAPSHOT` in `chat.attach`

**Files:**

- Modify: `packages/protocol/src/ui-types.ts` (`aguiSnapshotFor` emits `MESSAGES_SNAPSHOT`; `CONCIV_SNAPSHOT_EVENT` + `SnapshotSchema` deleted; import swap: `ChatHistorySchema` → `import type {ChatHistory} from './chat-types.js'`)
- Modify: `packages/core/src/api/chat/attach.ts:28` (drop the `generating` argument)
- Modify: `packages/protocol/test/ui-types.test.ts`
- Modify: whichever core tests assert the snapshot chunk shape — find them ALL first: `grep -rln 'CONCIV_SNAPSHOT_EVENT\|conciv-snapshot\|types\[0\]' packages/core/src packages/core/test packages/harness-testkit/src packages/extension-testkit/src --include='*.ts'` (known hit: `packages/core/test/rpc/wire.it.test.ts:35`)
- Test: additions to `packages/core/test/rpc/wire.it.test.ts` (the plan-1 wire IT — its `bootWire()` helper + `createTestHarness(requireClaude())` scripted harness is the established fixture; there is no other rpc chat fixture on the branch)

**Interfaces:**

- Consumes: `EventType`, `StreamChunk` from `@tanstack/ai`; `ChatHistory` from `@conciv/protocol/chat-types`.
- Produces: `aguiSnapshotFor(messages: ChatHistory): StreamChunk` returning `{type: EventType.MESSAGES_SNAPSHOT, messages}`. The `generating` flag is GONE from the wire: an attach during a live turn replays `RUN_STARTED` from the hub (plan 1 behavior), which `useChat` maps to `sessionGenerating` — pinned by the new IT below. Plan 2's client bridge (Task 4) and every future attach consumer rely on this exact first chunk.

- [ ] **Step 1: Write the failing protocol test**

Replace the snapshot cases in `packages/protocol/test/ui-types.test.ts` (read the file first; keep unrelated cases):

```ts
import {EventType} from '@tanstack/ai'
import {aguiSnapshotFor} from '../src/ui-types.js'

it('snapshot is a native MESSAGES_SNAPSHOT chunk carrying UIMessages verbatim', () => {
  const messages = [{id: 'm1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}]
  const chunk = aguiSnapshotFor(messages)
  expect(chunk.type).toBe(EventType.MESSAGES_SNAPSHOT)
  if (chunk.type === EventType.MESSAGES_SNAPSHOT) expect(chunk.messages).toEqual(messages)
})
```

Run: `pnpm --filter @conciv/protocol exec vitest run test/ui-types.test.ts`
Expected: FAIL (current impl returns a CUSTOM chunk)

- [ ] **Step 2: Implement in `ui-types.ts`**

Replace `CONCIV_SNAPSHOT_EVENT`, `SnapshotSchema`, `Snapshot`, and the current `aguiSnapshotFor` with:

```ts
const MessagesSnapshotChunkSchema = z.custom<StreamChunk>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === EventType.MESSAGES_SNAPSHOT &&
    'messages' in value &&
    Array.isArray(value.messages),
)

export function aguiSnapshotFor(messages: ChatHistory): StreamChunk {
  return MessagesSnapshotChunkSchema.parse({type: EventType.MESSAGES_SNAPSHOT, messages})
}
```

Why the zod boundary: the upstream `MessagesSnapshotEvent.messages` TYPE is the strict AG-UI wire `Message[]`, but TanStack's own processor documents and implements `UIMessage` passthrough (`aguiSnapshotMessageToUIMessage`: "a TanStack server echoing UIMessages back over the wire … pass through unchanged"). This is a known upstream type gap, not a hack: the payload is validated at the construction boundary and the end-to-end behavior is pinned by the Step 4 IT. Casting with `as` is still banned.

In `packages/core/src/api/chat/attach.ts`, change line 28 to `yield aguiSnapshotFor(messages)` and delete the now-unused `generating` local (line 23). Check for other `aguiSnapshotFor`/`SnapshotSchema` consumers with the grep from Files and fix each (the 2026-07-10 sweep found only `attach.ts`, protocol's own test, and `ui-types.ts`).

Run: `pnpm --filter @conciv/protocol exec vitest run test/ui-types.test.ts`
Expected: PASS

- [ ] **Step 3: Re-home the core assertions**

Run the Files grep; every test asserting `types[0] === EventType.CUSTOM` or matching `conciv-snapshot` flips to `EventType.MESSAGES_SNAPSHOT`. The known hit is `packages/core/test/rpc/wire.it.test.ts:35`:

```ts
expect(types[0]).toBe(EventType.MESSAGES_SNAPSHOT)
```

Run: `pnpm turbo run test --filter=@conciv/core --filter=@conciv/protocol`
Expected: PASS (except the known claude-image flake)

- [ ] **Step 4: Pin the generating-derivation contract**

Append to `packages/core/test/rpc/wire.it.test.ts`, using its existing `bootWire()` helper and scripted-gate idiom (read the file's first three tests before writing — copy their shapes exactly):

```ts
it('attach mid-turn replays RUN_STARTED after the snapshot so clients derive generating', async () => {
  const {kit, harness} = await bootWire()
  const sessionId = await kit.session()
  harness.__scripted.hold()
  await kit.rpc.chat.send({sessionId, text: 'hello'})
  const late = await kit.attach(sessionId)
  harness.__scripted.release()
  const events = await late.done({hangGuardMs: 10_000})
  const types = events.all.map((chunk) => chunk.type)
  expect(types[0]).toBe(EventType.MESSAGES_SNAPSHOT)
  expect(types).toContain(EventType.RUN_STARTED)
})
```

Run: `pnpm --filter @conciv/core exec vitest run test/rpc/wire.it.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/core
git commit -m "feat!(protocol,core): chat.attach snapshot is a native MESSAGES_SNAPSHOT chunk" -- packages/protocol packages/core
```

---

### Task 3: `@conciv/storage-history` package

**Files:**

- Create: `packages/storage-history/package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts` (mirror `packages/contract`'s scaffold — it has package.json/tsconfig/tsdown but NO vitest.config; read those three, write the vitest config fresh from the two-liner below)
- Create: `packages/storage-history/src/index.ts`
- Modify: `packages/publish/src/guards.ts` (`PUBLIC_PACKAGES` gains `@conciv/storage-history`, keep ordering convention)
- Test: `packages/storage-history/test/web-storage-history.test.ts`

**Interfaces:**

- Consumes: `createHistory`, `parseHref`, types from `@tanstack/history` (the ONLY dependency, spec rule).
- Produces: `createWebStorageHistory(opts: {storage: WebStorage; key?: string}): RouterHistory`, `WebStorage = Pick<Storage, 'getItem' | 'setItem'>`. Plan 3's `embed` calls it with `window.localStorage`; tests and sessionStorage callers inject their own. Persisted JSON shape `{entries: string[], index: number}` under key default `'conciv-history'`.

- [ ] **Step 1: Scaffold + install**

Mirror `packages/contract` (version matching the fixed set, `type: module`, single `.` export to `dist/index.js`, tsdown build, publint/attw, license/homepage/repository with `"directory": "packages/storage-history"`, `files: ["dist"]`). Description: `Web-Storage-persisted @tanstack/history for the conciv embed: entries/index round-trip with corrupted-storage fallback.`

Run: `cd packages/storage-history && pnpm add '@tanstack/history@^1.162.0' && pnpm add -D typescript vitest tsdown`
Then add `'@conciv/storage-history'` to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`.

`vitest.config.ts` pins `test: {environment: 'node', include: ['test/**/*.test.ts']}`.

- [ ] **Step 2: Write the failing tests**

`packages/storage-history/test/web-storage-history.test.ts`. `makeMemoryStorage` is a real, complete implementation of the `WebStorage` contract (two methods over a Map), not a behavioral mock:

```ts
import {describe, expect, it} from 'vitest'
import {createWebStorageHistory, type WebStorage} from '../src/index.js'

function makeMemoryStorage(): WebStorage & {map: Map<string, string>} {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

describe('createWebStorageHistory', () => {
  it('starts at / on empty storage', () => {
    const history = createWebStorageHistory({storage: makeMemoryStorage()})
    expect(history.location.pathname).toBe('/')
    expect(history.canGoBack()).toBe(false)
  })

  it('push navigates and a new instance on the same storage restores location and stack', () => {
    const storage = makeMemoryStorage()
    const first = createWebStorageHistory({storage})
    first.push('/panel')
    first.push('/panel/conciv_1')
    const reloaded = createWebStorageHistory({storage})
    expect(reloaded.location.pathname).toBe('/panel/conciv_1')
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/panel')
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/')
  })

  it('back, forward, and go clamp at the stack edges', () => {
    const history = createWebStorageHistory({storage: makeMemoryStorage()})
    history.push('/a')
    history.back()
    history.back()
    expect(history.location.pathname).toBe('/')
    history.forward()
    history.forward()
    expect(history.location.pathname).toBe('/a')
    history.go(-99)
    expect(history.location.pathname).toBe('/')
    history.go(99)
    expect(history.location.pathname).toBe('/a')
  })

  it('push after back truncates the forward stack', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    history.push('/a')
    history.push('/b')
    history.back()
    history.push('/c')
    history.forward()
    expect(history.location.pathname).toBe('/c')
    const reloaded = createWebStorageHistory({storage})
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/a')
  })

  it('search and hash round-trip through persistence', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    history.push('/quick?panes=conciv_1,conciv_2&focus=1')
    const reloaded = createWebStorageHistory({storage})
    expect(reloaded.location.pathname).toBe('/quick')
    expect(reloaded.location.search).toBe('?panes=conciv_1,conciv_2&focus=1')
  })

  it('falls back to / on corrupted JSON', () => {
    const storage = makeMemoryStorage()
    storage.map.set('conciv-history', '{nope')
    const history = createWebStorageHistory({storage})
    expect(history.location.pathname).toBe('/')
  })

  it.each([
    ['not an object', '"str"'],
    ['entries not strings', '{"entries":[1,2],"index":0}'],
    ['empty entries', '{"entries":[],"index":0}'],
    ['index out of range', '{"entries":["/a"],"index":9}'],
  ])('falls back safely when persisted shape is invalid: %s', (_name, raw) => {
    const storage = makeMemoryStorage()
    storage.map.set('conciv-history', raw)
    const history = createWebStorageHistory({storage})
    expect(['/', '/a']).toContain(history.location.pathname)
    expect(() => history.push('/next')).not.toThrow()
  })

  it('keeps navigating in memory when setItem throws', () => {
    const storage = makeMemoryStorage()
    const throwing: WebStorage = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const history = createWebStorageHistory({storage: throwing})
    history.push('/panel')
    expect(history.location.pathname).toBe('/panel')
  })

  it('caps the persisted stack at 100 entries, dropping the oldest', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    for (const n of Array.from({length: 150}, (_value, i) => i)) history.push(`/p${n}`)
    expect(history.location.pathname).toBe('/p149')
    const persisted: unknown = JSON.parse(storage.map.get('conciv-history') ?? '')
    expect(persisted).toMatchObject({index: 99})
    history.go(-99)
    expect(history.location.pathname).toBe('/p50')
  })

  it('honors a custom storage key', () => {
    const storage = makeMemoryStorage()
    createWebStorageHistory({storage, key: 'custom'}).push('/x')
    expect(storage.map.has('custom')).toBe(true)
    expect(storage.map.has('conciv-history')).toBe(false)
  })
})
```

Note on the invalid-shape case for `index out of range`: the implementation clamps rather than discards (entries are valid, only the index is bad), which is why the assertion accepts `/a`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @conciv/storage-history exec vitest run`
Expected: FAIL — cannot resolve `../src/index.js`

- [ ] **Step 4: Implement**

`packages/storage-history/src/index.ts` — mirrors `createMemoryHistory`'s mechanics (read `node_modules/.pnpm/@tanstack+history@1.162.0/node_modules/@tanstack/history/dist/esm/index.js` first) with persist-on-mutation:

```ts
import {createHistory, parseHref, type ParsedHistoryState, type RouterHistory} from '@tanstack/history'

export type WebStorage = Pick<Storage, 'getItem' | 'setItem'>

const DEFAULT_KEY = 'conciv-history'
const MAX_ENTRIES = 100

type Persisted = {entries: string[]; index: number}

function isPersisted(value: unknown): value is Persisted {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    Array.isArray(value.entries) &&
    value.entries.length > 0 &&
    value.entries.every((entry) => typeof entry === 'string') &&
    'index' in value &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index)
  )
}

function readPersisted(storage: WebStorage, key: string): Persisted {
  try {
    const raw = storage.getItem(key)
    if (!raw) return {entries: ['/'], index: 0}
    const parsed: unknown = JSON.parse(raw)
    if (!isPersisted(parsed)) return {entries: ['/'], index: 0}
    return {entries: parsed.entries, index: Math.min(Math.max(parsed.index, 0), parsed.entries.length - 1)}
  } catch {
    return {entries: ['/'], index: 0}
  }
}

function freshState(position: number): ParsedHistoryState {
  return {key: crypto.randomUUID().slice(0, 8), __TSR_index: position}
}

export function createWebStorageHistory(opts: {storage: WebStorage; key?: string}): RouterHistory {
  const key = opts.key ?? DEFAULT_KEY
  const persisted = readPersisted(opts.storage, key)
  const entries = persisted.entries
  const states = entries.map((_entry, position) => freshState(position))
  let index = persisted.index

  const persist = (): void => {
    try {
      opts.storage.setItem(key, JSON.stringify({entries, index}))
    } catch {
      return
    }
  }

  const trim = (): void => {
    if (entries.length <= MAX_ENTRIES) return
    const excess = entries.length - MAX_ENTRIES
    entries.splice(0, excess)
    states.splice(0, excess)
    index = Math.max(index - excess, 0)
  }

  let blockers: Parameters<NonNullable<Parameters<typeof createHistory>[0]['setBlockers']>>[0] = []

  return createHistory({
    getLocation: () => parseHref(entries[index] ?? '/', states[index]),
    getLength: () => entries.length,
    pushState: (path, state) => {
      if (index < entries.length - 1) {
        entries.splice(index + 1)
        states.splice(index + 1)
      }
      entries.push(path)
      states.push(state)
      index = entries.length - 1
      trim()
      persist()
    },
    replaceState: (path, state) => {
      entries[index] = path
      states[index] = state
      persist()
    },
    back: () => {
      index = Math.max(index - 1, 0)
      persist()
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
      persist()
    },
    go: (n) => {
      index = Math.min(Math.max(index + n, 0), entries.length - 1)
      persist()
    },
    createHref: (path) => path,
    getBlockers: () => blockers,
    setBlockers: (next) => {
      blockers = next
    },
  })
}
```

Two verification points while implementing (the tests are the arbiter):

1. `createHistory`'s `back`/`forward` receive `ignoreBlocker: boolean` as their argument — the memory impl ignores it; ours does too (signature `back: () => {...}` is fine because the option type is `(ignoreBlocker: boolean) => void` and a zero-arg function is assignable).
2. If the `blockers` type gymnastics above fight the compiler, import `NavigationBlocker` and use `let blockers: Array<NavigationBlocker> = []` — that is the actual type in `index.d.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @conciv/storage-history exec vitest run`
Expected: PASS (10 tests)
Run: `pnpm turbo run build --filter=@conciv/storage-history && pnpm --filter @conciv/storage-history typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add packages/storage-history packages/publish/src/guards.ts pnpm-lock.yaml
git commit -m "feat(storage-history): @conciv/storage-history — Web-Storage-persisted @tanstack/history" -- packages/storage-history packages/publish pnpm-lock.yaml
```

---

### Task 4: `@conciv/client` scaffold + `makeQueryUtils` + `chatConnection`

**Files:**

- Create: `packages/client/package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts` (mirror `packages/contract` — which has NO vitest.config, write it fresh; pin `environment: 'node'`, include `test/**/*.test.ts` and `test/**/*.it.test.ts`)
- Create: `packages/client/src/query-utils.ts`
- Create: `packages/client/src/chat-connection.ts`
- Create: `packages/client/src/index.ts` (entrypoint re-exports only)
- Create: `packages/harness-testkit/src/create-fake-harness.ts` (standalone scripted harness — testkit provides it, user rule: the testkit MUST provide whatever an app needs to conduct testing; only the `BootApp` leaf stays app-side because harness-testkit must never depend on `@conciv/core`)
- Modify: `packages/harness-testkit/src/testkit.ts` (export it), `packages/harness-testkit/src/serve-app.ts` (`port` passthrough + `ServedApp.port`), `packages/harness-testkit/src/create-testkit.ts` (`Kit.restartServer`)
- Create: `packages/client/test/helpers/boot.ts` (ONLY the `BootApp` leaf: `makeApp` wiring)
- Modify: `packages/publish/src/guards.ts` (`PUBLIC_PACKAGES` gains `@conciv/client`)
- Test: `packages/client/test/chat-connection.it.test.ts`, `packages/client/test/chat-reconnect.it.test.ts`

**Interfaces:**

- Consumes: `RpcClient` from `@conciv/contract` (Task 1); `createTanstackQueryUtils` from `@orpc/tanstack-query`; `SubscribeConnectionAdapter`, `UIMessage`, `ModelMessage` types via `@tanstack/ai-solid` re-exports; `MESSAGES_SNAPSHOT` first-chunk contract (Task 2).
- Produces: `makeQueryUtils(client: RpcClient)` + `QueryUtils`; `chatConnection(rpc: RpcClient, sessionId: string): SubscribeConnectionAdapter`; the boot helper `bootClientKit()` reused by Tasks 5–6.

- [ ] **Step 1: Scaffold + install**

Mirror `packages/contract`'s manifest (fixed-set version, publint/attw, `repository.directory: packages/client`). Description: `conciv client data layer: typed oRPC access, TanStack Query option factories, and the useChat connection bridge. Zero UI.`

Run: `cd packages/client && pnpm add '@conciv/contract@workspace:^' '@orpc/tanstack-query@^1.14.7' '@tanstack/ai-solid@^0.14.3' '@tanstack/ai@^0.40.0' && pnpm add -D typescript vitest tsdown '@conciv/core@workspace:^' '@conciv/harness-testkit@workspace:^' '@conciv/protocol@workspace:^' '@conciv/harness@workspace:^'`

Then satisfy `@orpc/tanstack-query@1.14.7`'s peers (verified from the published tarball): `@orpc/client` EXACT `1.14.7` (already a workspace-wide pin — any future `@orpc/client` bump must move `@orpc/tanstack-query` in lockstep; note it in the manifest ordering, pnpm auto-installs peers but the dep should be explicit) and `@tanstack/query-core >= 5.80.2` — add both as regular deps. Same check for `@tanstack/ai-solid` (`solid-js` peer → add `solid-js` matching the repo's existing version — read it from `packages/ui-kit-chat/package.json`).

Add `'@conciv/client'` to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`.

- [ ] **Step 2: Implement `makeQueryUtils` (no test of its own — Task 6 is its IT)**

`packages/client/src/query-utils.ts`:

```ts
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import type {RpcClient} from '@conciv/contract'

export function makeQueryUtils(client: RpcClient) {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>
```

(If `createTanstackQueryUtils`'s inference needs an explicit generic with `ContractRouterClient`, follow the error — check `node_modules/@orpc/tanstack-query/dist` types; adjust mechanically, never `as`.)

- [ ] **Step 3: Fake-harness factory in harness-testkit + the BootApp leaf in client**

3a. `packages/harness-testkit/src/create-fake-harness.ts` — a STANDALONE scripted harness (no real adapter base, unlike `createTestHarness`), built from the pieces harness-testkit already owns (`makeScriptedRun` in `scripted-run.ts`, `makeTextAdapter`, `defineHarness`). Export from `testkit.ts`. This is testkit-owned so `@conciv/client` now and `apps/conciv`/`embed` (plan 3) reuse it instead of forking fakes:

```ts
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type FakeHarness = HarnessAdapter & {
  __scripted: ScriptedRun
  __turnMessages: TextOptions<Record<string, never>>['messages'][]
}

export function createFakeHarness(opts: {id?: string; text?: string} = {}): FakeHarness {
  const id = opts.id ?? 'fake-harness'
  const scripted = makeScriptedRun({text: opts.text})
  const turnMessages: TextOptions<Record<string, never>>['messages'][] = []
  return Object.assign(
    defineHarness({
      id,
      binName: 'true',
      chatConfig: (deps) => ({
        adapter: makeTextAdapter(id, (options) => {
          turnMessages.push(options.messages)
          return scripted.chatStream(deps)
        }),
      }),
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: false,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
      },
    }),
    {__scripted: scripted, __turnMessages: turnMessages},
  )
}
```

(Reality checks: `makeScriptedRun` already provides `hold()`/`release()`/`scriptToolCall()` — the gate the ITs need, so no custom gate code anywhere; the `__turnMessages` capture mirrors `create-test-harness.ts:13-18` exactly — `TextOptions` imports from `@tanstack/ai` like there; `defineHarness` capability literal set — copy from `packages/core/test/api/chat/turn-error-flood.it.test.ts:11-20` if the names drifted; `TestHarness`'s `isTestHarness` guard in `create-testkit.ts` checks `'__scripted' in harness`, so `Kit.invokeTool`'s scripted path works with this fake unchanged. `transcriptHistory: false` keeps the fixture transcript-free; snapshot content comes from the hub's pending message — attach mid-turn — which is exactly what the bridge ITs need.)

3b. `packages/client/test/helpers/boot.ts` — ONLY the `BootApp` leaf (harness-testkit must never depend on `@conciv/core`, so `makeApp` wiring is the one app-side piece, mirroring `packages/core/test/helpers/boot.ts`):

```ts
import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'

export type ClientKit = Kit & {harness: FakeHarness; gate: {hold: () => void; release: () => void}}

export async function bootClientKit(): Promise<ClientKit> {
  const harness = createFakeHarness({id: 'fake-client', text: 'ok'})
  const kit = await createTestkit(harness, async (env) => {
    const {app, disposers} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: '',
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: env.cwd,
      openInEditor: () => {},
      harness: env.harness,
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }).setup()
  return {...kit, harness, gate: {hold: harness.__scripted.hold, release: harness.__scripted.release}}
}
```

(Reality check while writing: open `packages/core/src/app.ts` and `packages/core/src/config.ts` for the CURRENT `makeApp`/`ResolvedConcivConfig` signatures — plan 1 evolved them; the field list above is from `packages/core/test/helpers/boot.ts` as of 2026-07-10. NOTE the scripted-run gate semantics from `scripted-run.ts:42-44`: the gate stalls AFTER the text chunk and BEFORE `RUN_FINISHED` — the busy/mid-turn ITs in this plan rely on exactly that window.)

- [ ] **Step 4: Write the failing `chatConnection` IT**

`packages/client/test/chat-connection.it.test.ts` — drives the adapter over the REAL wire (served app + typed client), no `useChat` yet:

```ts
import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeRpcClient} from '@conciv/contract'
import {lastUserModelText} from '@conciv/harness'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

async function collectUntil(
  iterable: AsyncIterable<StreamChunk>,
  stop: (chunk: StreamChunk) => boolean,
): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = []
  for await (const chunk of iterable) {
    seen.push(chunk)
    if (stop(chunk)) break
  }
  return seen
}

async function firstChunk(iterator: AsyncIterator<StreamChunk>): Promise<StreamChunk | undefined> {
  const {value, done} = await iterator.next()
  return done ? undefined : value
}

describe('chatConnection', () => {
  it('subscribe yields the MESSAGES_SNAPSHOT first, then live chunks after send', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
    const snapshot = await firstChunk(stream)
    expect(snapshot?.type).toBe(EventType.MESSAGES_SNAPSHOT)
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hello'}]}])
    const seen = await collectUntil(
      {[Symbol.asyncIterator]: () => stream},
      (chunk) => chunk.type === EventType.RUN_FINISHED,
    )
    abort.abort()
    expect(seen.map((chunk) => chunk.type)).toContain(EventType.TEXT_MESSAGE_CONTENT)
    expect(seen.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('send extracts the LAST user message text and hands it to the harness', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)[Symbol.asyncIterator]()
    await firstChunk(stream)
    await connection.send([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
      {id: 'u2', role: 'user', parts: [{type: 'text', content: 'second line'}]},
    ])
    await collectUntil({[Symbol.asyncIterator]: () => stream}, (chunk) => chunk.type === EventType.RUN_FINISHED)
    abort.abort()
    const received = lastUserModelText(kit.harness.__turnMessages.at(-1) ?? [])
    expect(received).toContain('second line')
    expect(received).not.toContain('first')
  })

  it('send while the session is busy surfaces the typed BUSY error', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const connection = chatConnection(rpc, sessionId)
    kit.gate.hold()
    await connection.send([{id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]}])
    await expect(
      connection.send([{id: 'u2', role: 'user', parts: [{type: 'text', content: 'second'}]}]),
    ).rejects.toMatchObject({code: 'BUSY'})
    kit.gate.release()
  })
})
```

(Soundness-review amendments baked in: (a) test 1 consumes the snapshot BEFORE sending — the subscription must be established server-side first, same reason every wire IT awaits `kit.attach` before `send`; (b) test 2 asserts extraction on what the HARNESS received via `kit.harness.__turnMessages` + `lastUserModelText` (import it from `@conciv/harness` — exported at `registry.ts:8`), because the scripted fake answers `'ok'` regardless of input so output-side assertions prove nothing; it also gates on the snapshot first and sequences the turn end through the same subscribe stream — a post-hoc `kit.attach` on a settled `transcriptHistory: false` session would hang, the hub emits no `RUN_FINISHED` to late subscribers of a finished turn; (c) the busy test needs NO wait between sends — `chat.send` awaits `sendTurn` whose `hub.start` sets `generating` synchronously (`turn-hub.ts:102-111`), and `wire.it.test.ts:39-48` already does back-to-back sends deterministically. The BUSY matcher copies that test's exact shape.)

Run: `pnpm --filter @conciv/client exec vitest run test/chat-connection.it.test.ts`
Expected: FAIL — cannot resolve `../src/chat-connection.js`

- [ ] **Step 5: Implement `chatConnection`**

`packages/client/src/chat-connection.ts` — `subscribe` IS the reconnect loop (adversarial finding C1; see the Locked-API bullet). A stream that ends or errors for any reason other than the caller's abort re-attaches after `retryDelayMs` (default 500, the old widget's `DEFAULT_RETRY_MS`); snapshot-first attach makes each retry replay settled state, so the loop needs no bookkeeping:

```ts
import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'

export type ChatConnectionOptions = {retryDelayMs?: number; onRetry?: (error: unknown) => void}

function textOf(message: UIMessage | ModelMessage): string {
  if ('parts' in message) {
    return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  }
  return typeof message.content === 'string' ? message.content : ''
}

function lastUserText(messages: Array<UIMessage> | Array<ModelMessage>): string {
  const last = messages[messages.length - 1]
  return last ? textOf(last) : ''
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false
}

async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function* attachOnce(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  try {
    yield* await rpc.chat.attach({sessionId}, {signal})
  } catch (error) {
    if (!aborted(signal)) options.onRetry?.(error)
  }
}

async function* attachLoop(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  while (!aborted(signal)) {
    yield* attachOnce(rpc, sessionId, options, signal)
    if (aborted(signal)) return
    await sleep(options.retryDelayMs ?? 500, signal)
  }
}

export function chatConnection(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions = {},
): SubscribeConnectionAdapter {
  return {
    subscribe: (abortSignal) => attachLoop(rpc, sessionId, options, abortSignal),
    send: async (messages, _data, abortSignal) => {
      await rpc.chat.send({sessionId, text: lastUserText(messages)}, {signal: abortSignal})
    },
  }
}
```

Verification points: (a) plan 1's `wire.it.test.ts` and `create-testkit.ts` line 102 (`await rpc.chat.attach(...)` then iterate) show the resolved value is itself async-iterable — the `yield*` in `attachOnce` handles the promise; check the `{signal}` per-call option shape against `node_modules/@orpc/client/dist` types. (b) `chat.send`'s zod input requires `text.min(1)` — an all-attachment message would be rejected by the contract; acceptable now, the composer always sends text (drafts/grabs are consumed server-side per plan 1's send semantics), image/attachment input never shipped in the old widget and would need a contract extension in a later phase. (c) `onRetry` is the hook plan 3 uses for a "reconnecting…" announcement (the old live-region behavior); the abort-listener leak in `sleep` is bounded by one listener per retry — if lint flags it, pass `{once: true}`.

Add the reconnect regression test `packages/client/test/chat-reconnect.it.test.ts` — user-locked constraints (2026-07-10): NO doubles/shims of any kind, oRPC testing surfaces only. So this is a REAL server-restart test over the real wire: the harness-testkit `Kit` gains `restartServer()` (see the harness-testkit step below), the typed client is `makeRpcClient` (`createORPCClient` + `RPCLink`), and the assertion is the exact production scenario the loop exists for — a core dev-server restart while a pane is attached:

```ts
import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient} from '@conciv/contract'
import {chatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('chatConnection reconnect', () => {
  it('survives a server restart: fresh attach yields a second snapshot without resubscribing', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const retries: unknown[] = []
    const connection = chatConnection(rpc, sessionId, {retryDelayMs: 25, onRetry: (error) => retries.push(error)})
    const abort = new AbortController()
    const snapshots: StreamChunk[] = []
    const consumer = (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) {
        if (chunk.type === EventType.MESSAGES_SNAPSHOT) snapshots.push(chunk)
        if (snapshots.length === 2) abort.abort()
      }
    })()
    await until(() => snapshots.length === 1, {hangGuardMs: 5000})
    await kit.restartServer()
    await until(() => snapshots.length === 2, {hangGuardMs: 5000})
    await consumer
    expect(retries.length).toBeGreaterThanOrEqual(1)
  })
})
```

**Harness-testkit change this step also lands** (add to this task's Files + commit): `packages/harness-testkit/src/serve-app.ts` — `serveApp(fetch, opts?: {port?: number})` forwards `port` to `serveHono` (verified: `packages/serve/src/serve.ts:29-41` already accepts `port`) and `ServedApp` gains the bound `port`; `packages/harness-testkit/src/create-testkit.ts` — `Kit` gains `restartServer: () => Promise<void>` that closes the current server and re-serves the SAME booted app fetch on the SAME port:

```ts
restartServer: async () => {
  await served.close()
  served = await serveApp(app.fetch, {port: served.port})
},
```

(`served` flips from `const` to `let`; `base` stays valid because the port is pinned. Verification points: (a) `closeServer` in `packages/serve/src/serve.ts` — if `server.close()` hangs on the open attach response, add `server.closeAllConnections()` before close inside `@conciv/serve`'s `closeServer` (node:http standard API, real behavior — a killed dev server drops sockets exactly like this); (b) rebinding the same port immediately after close can race on some platforms — if flaky, retry the `serveApp` call inside `restartServer` with `until`. Unit-cover the new surface inside harness-testkit itself: `packages/harness-testkit/test/` currently may not exist — if it doesn't, the client-side reconnect IT above is the covering test, which is acceptable because it exercises the exact consumer path.)

`packages/client/src/index.ts`:

```ts
export * from './query-utils.js'
export * from './chat-connection.js'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @conciv/client exec vitest run test/chat-connection.it.test.ts test/chat-reconnect.it.test.ts`
Expected: PASS (4 tests)
Run: `pnpm turbo run test --filter=@conciv/harness-testkit --filter=@conciv/core`
Expected: PASS — the testkit changes (fake harness export, serveApp port, restartServer) must not disturb existing consumers.
Run: `pnpm turbo run build --filter=@conciv/client && pnpm --filter @conciv/client typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add packages/client packages/harness-testkit packages/publish/src/guards.ts pnpm-lock.yaml
git commit -m "feat(client,harness-testkit): chatConnection reconnect bridge + fake-harness/restartServer testkit surface" -- packages/client packages/harness-testkit packages/publish pnpm-lock.yaml
```

---

### Task 5: `useChatSession` — the Solid hook over the bridge

**Files:**

- Create: `packages/client/src/use-chat-session.ts`
- Modify: `packages/client/src/index.ts`
- Test: `packages/client/test/use-chat-session.it.test.ts`

**Interfaces:**

- Consumes: `chatConnection` (Task 4), `useChat` from `@tanstack/ai-solid` (verified: `live: true` subscribes on creation, unsubscribes on `onCleanup`; `id` keys the client).
- Produces: `useChatSession(options: UseChatSessionOptions)` — the spec's "~15-line connection bridge". One hook call per route component; session switch is component remount (route param), so `sessionId` is a plain string, NOT an accessor — document this in the plan-3 kickoff.

- [ ] **Step 1: Write the failing IT**

`packages/client/test/use-chat-session.it.test.ts` — Solid primitives run headless under `createRoot` in the node environment (no DOM access in `use-chat.js` — verified; `mountDevtools` is a no-op without a bridge factory... it PASSES `createChatDevtoolsBridge`; if that touches DOM/globals at mount, see the fallback note at the end of this step):

```ts
import {afterEach, describe, expect, it} from 'vitest'
import {createRoot} from 'solid-js'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient} from '@conciv/contract'
import {useChatSession} from '../src/use-chat-session.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('useChatSession', () => {
  it('sendMessage round-trips: user message renders, assistant text streams in, loading settles', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    await createRoot(async (dispose) => {
      const chat = useChatSession({rpc, sessionId})
      await until(() => chat.connectionStatus() === 'connected', {hangGuardMs: 5000})
      await chat.sendMessage('hello')
      await until(
        () =>
          chat
            .messages()
            .some(
              (message) =>
                message.role === 'assistant' &&
                message.parts.some((part) => part.type === 'text' && part.content.includes('ok')),
            ),
        {hangGuardMs: 5000},
      )
      expect(chat.messages()[0]?.role).toBe('user')
      await until(() => !chat.isLoading(), {hangGuardMs: 5000})
      dispose()
    })
  })

  it('attaching mid-turn hydrates messages from the snapshot and flags generating', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    kit.gate.hold()
    await rpc.chat.send({sessionId, text: 'started elsewhere'})
    await createRoot(async (dispose) => {
      const chat = useChatSession({rpc, sessionId})
      await until(() => chat.messages().length > 0, {hangGuardMs: 5000})
      expect(
        chat
          .messages()
          .some((message) =>
            message.parts.some((part) => part.type === 'text' && part.content.includes('started elsewhere')),
          ),
      ).toBe(true)
      await until(() => chat.sessionGenerating(), {hangGuardMs: 5000})
      kit?.gate.release()
      await until(() => !chat.sessionGenerating(), {hangGuardMs: 5000})
      dispose()
    })
  })
})
```

(SNAPSHOT-WIPE RACE, soundness finding S3 — this is why test 1 gates on `connectionStatus() === 'connected'` and NOT on `isSubscribed()`: `subscribe()` sets `isSubscribed` synchronously before any network happens, while `consumeSubscription` flips `connectionStatus` to `'connected'` in the same synchronous block that processes the FIRST received chunk — i.e. once the poll observes `'connected'`, the initial `MESSAGES_SNAPSHOT` has been applied. Sending before that lets the late empty snapshot `resetStreamState()` and WIPE the optimistic user message. The same race exists in production for a composer that mounts-and-sends immediately — carry this as a design note into the plan-3 kickoff: gate the composer's first send on connection, or plan 3 revisits snapshot/optimistic reconciliation. Field-name check before running: the exact accessor names on `UseChatReturn` are `connectionStatus`, `sessionGenerating`, `isLoading` — confirm in `node_modules/@tanstack/ai-solid/dist/types.d.ts` `BaseUseChatReturn`; adjust to what is actually exported. FALLBACK if `useChat` proves un-runnable outside a browser (e.g. devtools bridge touches `window` on `mountDevtools`): keep the hook one-expression thin, delete this IT file, and instead add `packages/client/test/chat-client.it.test.ts` driving `new ChatClient({connection: chatConnection(...), ...callbacks})` from `@tanstack/ai-client` directly with the same assertions through `onMessagesChange`/`onSessionGeneratingChange` callbacks — the hook body then carries zero logic beyond `useChat(...)` composition and plan 3's browser suites cover it. Record which path was taken in the commit message.)

Run: `pnpm --filter @conciv/client exec vitest run test/use-chat-session.it.test.ts`
Expected: FAIL — cannot resolve `../src/use-chat-session.js`

- [ ] **Step 2: Implement**

`packages/client/src/use-chat-session.ts`:

```ts
import {useChat} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'
import {chatConnection} from './chat-connection.js'

export type UseChatSessionOptions = {
  rpc: RpcClient
  sessionId: string
  onCustomEvent?: (eventType: string, data: unknown, context: {toolCallId?: string}) => void
  onError?: (error: Error) => void
}

export function useChatSession(options: UseChatSessionOptions): ReturnType<typeof useChat> {
  return useChat({
    id: options.sessionId,
    connection: chatConnection(options.rpc, options.sessionId),
    live: true,
    onCustomEvent: options.onCustomEvent,
    onError: options.onError,
  })
}
```

(If `ReturnType<typeof useChat>` collapses generics poorly, export the concrete alias `UseChatReturn` from `@tanstack/ai-solid` instead: `import type {UseChatReturn} from '@tanstack/ai-solid'` and return `UseChatReturn`. Follow the compiler.)

Append to `packages/client/src/index.ts`:

```ts
export * from './use-chat-session.js'
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter @conciv/client exec vitest run test/use-chat-session.it.test.ts`
Expected: PASS (2 tests) — or the documented ChatClient fallback suite passing.

- [ ] **Step 4: Commit**

```bash
git add packages/client
git commit -m "feat(client): useChatSession — useChat over the chat.attach/send bridge" -- packages/client
```

---

### Task 6: Query-layer IT — option factories against the real wire

**Files:**

- Modify: `packages/client/package.json` (devDep `@tanstack/solid-query`)
- Test: `packages/client/test/query-utils.it.test.ts`

**Interfaces:**

- Consumes: `makeQueryUtils` (Task 4), `bootClientKit` (Task 4), `QueryClient`/`QueryObserver` from `@tanstack/solid-query` (re-exported from `@tanstack/query-core` — headless, no DOM).
- Produces: proof that `queryOptions`, `mutationOptions`, and `experimental_liveOptions` compose with TanStack Query against the real server — the exact surfaces `apps/conciv` (plan 3) builds on.

- [ ] **Step 1: Install + write the failing IT**

Run: `cd packages/client && pnpm add -D @tanstack/solid-query` (latest v5; it becomes a PROD dependency of `apps/conciv` in plan 3, here it is test-only).

`packages/client/test/query-utils.it.test.ts`:

```ts
import {afterEach, describe, expect, it} from 'vitest'
import {MutationObserver, QueryClient, QueryObserver} from '@tanstack/solid-query'
import {until} from '@conciv/harness-testkit/until'
import {makeRpcClient, type SessionMeta} from '@conciv/contract'
import {makeQueryUtils} from '../src/query-utils.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

let kit: ClientKit | undefined
afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

describe('makeQueryUtils', () => {
  it('queryOptions fetch through the real wire', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const utils = makeQueryUtils(makeRpcClient(kit.base))
    const queryClient = new QueryClient()
    const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
    expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
    const models = await queryClient.fetchQuery(utils.meta.models.queryOptions())
    expect(models.harness.id).toBe('fake-client')
  })

  it('mutationOptions execute intents', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const utils = makeQueryUtils(makeRpcClient(kit.base))
    const queryClient = new QueryClient()
    const rename = new MutationObserver(queryClient, utils.sessions.rename.mutationOptions())
    const renamed = await rename.mutate({sessionId, title: 'named by mutation'})
    expect(renamed.title).toBe('named by mutation')
  })

  it('experimental_liveOptions re-emit when the server pushes a sessions change', async () => {
    kit = await bootClientKit()
    const sessionId = await kit.session()
    const rpc = makeRpcClient(kit.base)
    const utils = makeQueryUtils(rpc)
    const queryClient = new QueryClient()
    const observer = new QueryObserver<SessionMeta[]>(queryClient, {
      ...utils.sessions.live.experimental_liveOptions(),
      retry: true,
    })
    const titles: string[][] = []
    const unsubscribe = observer.subscribe((result) => {
      if (result.data) titles.push(result.data.map((meta) => meta.title))
    })
    await until(() => titles.length > 0, {hangGuardMs: 5000})
    await rpc.sessions.rename({sessionId, title: 'live-renamed'})
    await until(() => (titles.at(-1) ?? []).includes('live-renamed'), {hangGuardMs: 5000})
    unsubscribe()
    expect(titles.at(-1)).toContain('live-renamed')
  })
})
```

(NAMING IS LOAD-BEARING, soundness finding S1: the installed `@orpc/tanstack-query@1.14.7` exports `experimental_liveOptions`/`experimental_streamedOptions` — the unprefixed names DO NOT EXIST; `experimental_LiveQueryOutput<TOutput>` unwraps the iterator so the observer data is plain `SessionMeta[]`. Type checks while writing: if the spread fights `QueryObserver`'s generics, pass extra options INTO the factory instead — `utils.sessions.live.experimental_liveOptions({retry: true})` — matching the oRPC docs. `MutationObserver.mutate` argument shape: `mutate(variables)`. Confirm both against `node_modules/@tanstack/query-core/dist` types.)

Run: `pnpm --filter @conciv/client exec vitest run test/query-utils.it.test.ts`
Expected: FAIL initially only if wiring is wrong — this task has no new prod code, so a first-run PASS is acceptable and the suite stays as the regression pin.

- [ ] **Step 2: Run + commit**

Run: `pnpm --filter @conciv/client exec vitest run`
Expected: PASS (all client suites)

```bash
git add packages/client pnpm-lock.yaml
git commit -m "test(client): query/mutation/live option factories pinned against the real rpc wire" -- packages/client pnpm-lock.yaml
```

---

### Task 7: Plan-wide gates

**Files:** none new; whole-repo verification.

- [ ] **Step 1: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: exit 0, EXCEPT the known pre-existing `packages/core/test/api/mcp/claude-image.it.test.ts` flake (fails identically on main; does not gate).

- [ ] **Step 2: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. Likely hits to pre-empt: `SnapshotSchema`/`CONCIV_SNAPSHOT_EVENT` leftovers in protocol (Task 2 deletes them — verify with `pnpm exec fallow dead-code --trace 'packages/protocol/src/ui-types.ts:SnapshotSchema'` before deleting anything fallow flags), and duplicate-code flags if the boot helper drifted from core's (acceptable only if fallow stays quiet; otherwise extract the truly-shared fragment upward into harness-testkit ONLY if fallow forces it).

- [ ] **Step 3: New-function complexity**

Run: `pnpm exec fallow health packages/client packages/storage-history --format json 2>/dev/null || pnpm exec fallow audit --changed-since main --format json`
Every new function cyclomatic ≤ 4 (the storage-history validators and `chatConnection` helpers above are written to comply — if a rewrite pushed one over, split it).

- [ ] **Step 4: Commit any gate fixes**

```bash
git add -A packages/client packages/storage-history packages/contract packages/protocol packages/core packages/harness-testkit
git commit -m "chore: widget-rewrite plan 2 gates — typecheck, tests, fallow clean" -- packages/client packages/storage-history packages/contract packages/protocol packages/core packages/harness-testkit
```

---

## Self-review notes (kept for the executor)

- **Adversarial review 2026-07-10 (two agents: old-widget capability coverage + plan soundness) folded in.** Coverage findings: C1 CRITICAL — `useChat` never resubscribes after a dropped stream (verified against installed `ai-client`/`ai-solid`); reconnect loop now lives in `chatConnection.subscribe` (Task 4) with a real server-restart IT (`Kit.restartServer`). C2 MAJOR — RESOLVED BY PLAN 2.5 (user decision 2026-07-10, superseding the same-day deferral): the gen-UI custom-event lane (`CONCIV_UI_EVENT`, `uiBus.inject`, `POST /api/chat/ui`, the `conciv ui` CLI command) is DELETED in plan 2.5 (`2026-07-10-widget-rewrite-2.5-genui-native-tools.md`, executes after this plan); `conciv_ui` becomes a BLOCKING tool whose result is the user's answer (`chat.uiReply` intent), rendered natively from `ToolCallPart` by name — spec change 6 achieved through TanStack AI's own tool lane, no new part types, no keyed render buffer, no demux in plan 3. `useChatSession.onCustomEvent` remains only for approval-requested (approvals stay hybrid) and tool durations. C3 MINOR — old `PaneSnapshot.scrollTop`/`focused` are intentionally DROPPED from persistence (device state; plan-3 in-memory concern; drafts/markers rows cover the rest). C4 MINOR — image/attachment input never shipped in the old widget; the old wire lane dies with the REST routes; shipping images later requires a contract extension (parts on `chat.send` or an upload procedure) — backlog, extension phase. User-locked test rules folded the same day: NO doubles/shims anywhere; oRPC surfaces (`RPCLink` typed client) for testing; harness-testkit MUST provide everything app tests need except the `BootApp` leaf (which stays app-side because harness-testkit can never depend on `@conciv/core`). Soundness findings folded: S1 `experimental_liveOptions`/`experimental_streamedOptions` naming (stable names absent from 1.14.7); S2 Task 2 re-targeted to the REAL `packages/core/test/rpc/wire.it.test.ts` fixture (`bootWire` + scripted gate — the originally-cited `chat-rpc.it.test.ts`/`makeRpcFixture` never existed on the branch); S3 snapshot-wipe race — gate first send on `connectionStatus === 'connected'`, carried into the plan-3 kickoff as a composer design note; S4 send-extraction IT asserts on `__turnMessages` via `lastUserModelText` (output-side assertions were vacuous); S5 `attachLoop`/`attachOnce` named generators ARE the implementation (a direct promise-returning `subscribe` throws in `for await`); S6 subscription-establishment gate before every send in the ITs; S7 both `@orpc/*` deps leave harness-testkit; S8 contract has no vitest.config — new packages write theirs fresh; S9 `ChatHistory` type import swap in ui-types; S10 both `@orpc/tanstack-query` peers named (`@orpc/client` EXACT `1.14.7` lockstep warning); S11 busy test needs no inter-send wait (`generating` flips synchronously in `hub.start`). Verified-sound list retained by the reviewer: no `@conciv/client` dependents (no cycle), boot-helper field lists exact, `useChat` node-headless-safe (devtools bridge `typeof window`-guarded), mid-turn snapshot carries the pending user message, rename pulses `sessions.live`, all `@tanstack/history` claims, storage-history test arithmetic including the 100-cap `go(-99)` case.
- **Spec coverage in this plan:** `client` package (query utils ✓ T4, chat bridge ✓ T4/T5, zero UI ✓ by construction), `storage-history` ✓ T3 (entries/index round-trip + corrupted fallback unit-tested per spec), oRPC TanStack Query official integration ✓ T4/T6, `useChat` fed by typed iterator ✓ T5, snapshot-first attach with no client bookkeeping ✓ T2. Deliberately NOT here (later plans): routes/`apps/conciv`/embed (plan 3), page split + extension rewire (plan 4), draft composer debounce (plan 3 UI).
- **Old-widget capability → new home ledger (client-plane concerns only):** attach SSE parse loop → `chatConnection.subscribe`; send POST → `chatConnection.send`; session list cache/callbacks → `utils.sessions.live.experimental_liveOptions`; models/commands/tools GETs → `utils.meta.*.queryOptions`; rename/remove/stop/launch/compact/setModel wrappers → `utils.sessions.*.mutationOptions`; permission decision POST → `utils.chat.permissionDecision.mutationOptions`; drafts/ui-snapshot localStorage → `utils.drafts.*` (server rows); layer/pane sessionStorage restore → `@conciv/storage-history` (router history, plan 3 routes); model localStorage bootstrap → server `sessions.model` column (superseded, plan 1). Gen-UI demux → DELETED by plan 2.5 (blocking `conciv_ui` tool, native `ToolCallPart` rendering); tool-timing + approval-requested → `onCustomEvent` passthrough on `useChatSession`.
- **Library-verification provenance:** every signature in "Verified API facts" was read from the installed `node_modules` on 2026-07-10 (`@orpc` 1.14.7, `@tanstack/ai-solid` 0.14.3, `@tanstack/ai-client` 0.20.0, `@tanstack/ai` 0.40.0, `@tanstack/history` 1.162.0) or, for the two not-yet-installed packages (`@orpc/tanstack-query`, `@tanstack/solid-query`), from the official oRPC docs. Executor re-checks ONLY where a step says "verify/check" — do not re-derive the rest.
- **The one type-level landmine:** `MESSAGES_SNAPSHOT.messages` upstream type vs `UIMessage[]` payload (Task 2). The zod-boundary construction is the agreed pattern; if a future `@tanstack/ai` release widens the type, delete the schema and construct directly.
