# Agent API Surface — Platform (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every core oRPC procedure becomes an agent-visible, approval-gated capability through one dispatch-level gate, one metadata type, and one catalog — no parallel tool plumbing left for the core contract.

**Architecture:** A shared `AgentMeta` on every contract procedure resolves into a total `ResolvedAgentPolicy` catalog at boot. The served router is a WRAPPED router (`gateRouter`): each leaf procedure is re-created with the same contract (schemas + errors) and a handler that runs the permission gate (branded `Principal`, ask via `AskRegistry`), then invokes the original procedure. The agent bridge is an in-process client of that same wrapped router with an agent principal; the code-mode catalog is generated from `ResolvedAgentPolicy`. Wrapping at build time (not oRPC middleware inheritance) is the enforcement mechanism because middleware cannot be retrofitted onto prebuilt routers.

**Tech Stack:** TypeScript strict, oRPC (`@orpc/server`, `@orpc/contract`), zod v4, Hono, vitest, existing `@tanstack/ai-code-mode` sandbox.

**Spec:** `docs/superpowers/specs/2026-08-22-agent-api-surface-design.md` — read it fully before starting any task.

## Global Constraints

- Blocked behind `feat/session-scope-enforcement`. Assumed interface consumed from that lane (verify it exists before Task 1; if signatures differ, STOP and update this plan first):
  - `session(): SessionId` — ambient, throws outside an established context (`packages/core/src/session/context.ts` or wherever the lane placed it — locate with `grep -rn "AsyncLocalStorage" packages/core/src`)
  - `withSession(id: SessionId, fn: () => Promise<T>): Promise<T>`
  - Boundary parses at `/rpc`, `/rpc-ws`, `/api/mcp` already reject missing/invalid session.
- Code style: functions only, zero comments, no `any`/`as`/non-null assertions, no IIFEs, no barrel files, kebab-case files, oxfmt (no semicolons, single quotes, 120 width). No em dashes in code.
- TDD per task. Tests: vitest, `environment: 'node'` pinned in every Solid package config (not relevant here — these are node packages). No jsdom, no mocks/stubs of our own code; real registries, real routers.
- Gates: `pnpm turbo run test --filter=<pkg>` (bare filter, NEVER trailing `...`). Before each commit: `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` — fix INTRODUCED findings. Never pipe gate output through grep/tail; redirect to file, `echo $?`.
- Commit per task with pathspec (parallel sessions): `git commit -- <paths>`.
- One changeset covers the lane (Task 12).
- v0: no back-compat; update every call site you break in the same task.
- `packages/contract` may not import from `packages/core` (no cross-package relative paths; respect dependency direction contract → protocol).

## File Structure (locked)

- Create: `packages/contract/src/agent-meta.ts` — `AgentMeta`, `ResolvedAgentPolicy`, `resolveAgentPolicy`
- Create: `packages/core/src/gate/principal.ts` — branded `Principal`, boundary-only constructors
- Create: `packages/core/src/gate/plane-credential.ts` — widget plane credential issue/verify
- Create: `packages/core/src/gate/gate-router.ts` — `gateRouter(router, catalog, deps)` wrap pass
- Create: `packages/core/src/gate/approvals.ts` — digest, queue/reentrancy, cancellation
- Create: `packages/core/src/gate/catalog.ts` — walker: composite router → `ResolvedAgentPolicy` map, naming, build errors
- Create: `packages/core/src/gate/collectors.ts` — bounded stream collectors
- Create: `packages/core/src/gate/cross-session.ts` — origin trace, SELF_TARGET/CYCLE, rate limits
- Modify: `packages/contract/src/contract.ts` — meta on all 40 procedures; delete `registry.call`
- Modify: `packages/core/src/api/rpc/mount.ts`, `router.ts` — serve wrapped router; delete `approveAskGatedCall`
- Modify: `packages/core/src/api/mcp.ts` — capabilities from catalog; agent principal
- Modify: `packages/core/src/app.ts` — delete `assistCapabilities` wiring; assemble catalog + gateRouter
- Modify: `packages/core/src/chat/code-mode.ts` — remove `gatedToolRun` approval logic (gate moved into router)
- Modify: `packages/contract/src/browser-transport.ts` — send plane credential header per call
- Delete: `assistCapabilities` in `packages/core/src/chat/capabilities.ts`; `conciv_ui`/`conciv_extensions` re-registered as procedures
- Tests: sibling `*.test.ts` under each package's existing test layout (`packages/core/test/gate/*.test.ts`, `packages/contract/test/agent-meta.test.ts`)

Tasks below give exact signatures; later tasks consume earlier ones by those names.

---

### Task 1: AgentMeta + ResolvedAgentPolicy

**Files:**

- Create: `packages/contract/src/agent-meta.ts`
- Test: `packages/contract/test/agent-meta.test.ts`

**Interfaces:**

- Produces:
  - `type AgentMeta = {summary?: string; readonly?: true; disclosure?: 'sensitive'; agent?: false; stream?: true; category?: string}`
  - `type ResolvedAgentPolicy = {path: readonly string[]; name: string; summary: string; category: string; access: 'free' | 'ask' | 'deny'; stream: boolean; firstParty: boolean}`
  - `resolveAgentPolicy(path: readonly string[], meta: AgentMeta | undefined, opts: {firstParty: boolean; trusted: boolean}): ResolvedAgentPolicy | null` — `null` = excluded (`agent: false`)

- [ ] **Step 1: Write the failing tests**

```ts
import {describe, expect, it} from 'vitest'
import {resolveAgentPolicy} from '../src/agent-meta.js'

const first = {firstParty: true, trusted: false}

describe('resolveAgentPolicy', () => {
  it('excludes agent:false before anything else, even without summary', () => {
    expect(resolveAgentPolicy(['chat', 'permissionDecision'], {agent: false}, first)).toBeNull()
  })
  it('throws on included procedure missing summary, naming the path', () => {
    expect(() => resolveAgentPolicy(['sessions', 'list'], {readonly: true}, first)).toThrow('sessions.list')
  })
  it('bare meta with summary resolves to ask', () => {
    const p = resolveAgentPolicy(['drafts', 'set'], {summary: 'save draft'}, first)
    expect(p?.access).toBe('ask')
  })
  it('first-party readonly non-sensitive resolves to free', () => {
    const p = resolveAgentPolicy(['sessions', 'list'], {summary: 'list sessions', readonly: true}, first)
    expect(p?.access).toBe('free')
  })
  it('sensitive readonly resolves to ask', () => {
    const p = resolveAgentPolicy(
      ['drafts', 'get'],
      {summary: 'read draft', readonly: true, disclosure: 'sensitive'},
      first,
    )
    expect(p?.access).toBe('ask')
  })
  it('third-party untrusted readonly resolves to ask regardless of self-assertion', () => {
    const p = resolveAgentPolicy(
      ['ext', 'x', 'peek'],
      {summary: 'peek', readonly: true},
      {firstParty: false, trusted: false},
    )
    expect(p?.access).toBe('ask')
  })
  it('third-party trusted readonly resolves to free', () => {
    const p = resolveAgentPolicy(
      ['ext', 'x', 'peek'],
      {summary: 'peek', readonly: true},
      {firstParty: false, trusted: true},
    )
    expect(p?.access).toBe('free')
  })
  it('encodes names deterministically', () => {
    const p = resolveAgentPolicy(['ext', 'whiteboard', 'comments', 'insert'], {summary: 's'}, first)
    expect(p?.name).toBe('whiteboard_comments_insert')
  })
})
```

Name encoding rule (implement exactly): drop a leading `ext` segment, join remaining segments with `_`, then replace every character outside `[a-zA-Z0-9_]` with `_`. No suffixing; collision handling is Task 5's build error.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm turbo run test --filter=@conciv/contract > /tmp/t1.log 2>&1; echo $?` — expect fail, `resolveAgentPolicy` not found.

- [ ] **Step 3: Implement `agent-meta.ts`** — pure functions, no state. `access` derivation: `agent === false → null`; missing summary → `throw new Error(\`agent-visible procedure ${path.join('.')} is missing meta.summary\`)`; then `readonly && disclosure !== 'sensitive' && (firstParty || trusted) ? 'free' : 'ask'`.

- [ ] **Step 4: Run to green.** Same command, expect pass.

- [ ] **Step 5: Commit** `feat(contract): AgentMeta and ResolvedAgentPolicy resolver` (pathspec: the two files).

---

### Task 2: Branded Principal

**Files:**

- Create: `packages/core/src/gate/principal.ts`
- Test: `packages/core/test/gate/principal.test.ts`

**Interfaces:**

- Produces:
  - `type Principal` — branded via module-private symbol; `plane: 'human' | 'agent'` readable
  - `makeBoundaryPrincipals(): {human: () => Principal; agent: () => Principal; isPrincipal: (v: unknown) => v is Principal; planeOf: (p: Principal) => 'human' | 'agent'}` — called ONCE in `app.ts`; the returned constructors are handed only to boundary adapters (rpc mount, mcp mount). Nothing else can mint one: the brand symbol never leaves the module, and the factory result is not exported from any shared surface.

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from 'vitest'
import {makeBoundaryPrincipals} from '../../src/gate/principal.js'

describe('principal', () => {
  it('mints human and agent principals distinguishable by planeOf', () => {
    const b = makeBoundaryPrincipals()
    expect(b.planeOf(b.human())).toBe('human')
    expect(b.planeOf(b.agent())).toBe('agent')
  })
  it('rejects structurally-identical forgeries', () => {
    const b = makeBoundaryPrincipals()
    expect(b.isPrincipal({plane: 'human'})).toBe(false)
    const real = JSON.parse(JSON.stringify(b.human()))
    expect(b.isPrincipal(real)).toBe(false)
  })
  it('principals from a different factory instance are still recognized (one process, one brand)', () => {
    const a = makeBoundaryPrincipals()
    const b = makeBoundaryPrincipals()
    expect(b.isPrincipal(a.human())).toBe(true)
  })
})
```

- [ ] **Step 2: Run to fail.** `pnpm turbo run test --filter=@conciv/core > /tmp/t2.log 2>&1; echo $?`
- [ ] **Step 3: Implement** — module-level `const brand = Symbol('principal')`; principal objects are frozen `{[brand]: true, plane}`; `isPrincipal` checks the symbol via `Object.getOwnPropertySymbols` equality with the module's own symbol.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit** `feat(core): branded caller principal`.

---

### Task 3: Widget plane credential

**Files:**

- Create: `packages/core/src/gate/plane-credential.ts`
- Modify: `packages/contract/src/browser-transport.ts` (headers fn), `packages/core/src/app.ts` (issue + inject into widget bootstrap config), rpc mount (verify)
- Test: `packages/core/test/gate/plane-credential.test.ts`

**Interfaces:**

- Produces: `makePlaneCredential(): {value: string; verify: (header: string | null | undefined) => boolean}` (random 32-byte hex via `node:crypto` `randomBytes`, constant-time compare via `timingSafeEqual`)
- Header name constant `CONCIV_PLANE_HEADER = 'conciv-plane'` exported from `packages/protocol/src/chat-types.ts` next to the session header.
- Consumes: widget bootstrap config path — find where the widget receives its RPC config (search `apiBase` in `apps/conciv/src` and the embed mount config) and add `planeCredential: string` there; `browser-transport.ts` `headers` fn (evaluated per RPC frame — this is why WS needs no separate upgrade binding) sends it.

- [ ] **Step 1: Failing test** — `verify` accepts the issued value, rejects null/other/prefix; two `makePlaneCredential()` values differ.

```ts
import {describe, expect, it} from 'vitest'
import {makePlaneCredential} from '../../src/gate/plane-credential.js'

describe('plane credential', () => {
  it('verifies only its own value', () => {
    const c = makePlaneCredential()
    expect(c.verify(c.value)).toBe(true)
    expect(c.verify(undefined)).toBe(false)
    expect(c.verify(c.value.slice(0, -1))).toBe(false)
    expect(c.verify(makePlaneCredential().value)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement + wire.** In `app.ts`: `const planeCredential = makePlaneCredential()`; pass `planeCredential.value` into the widget bootstrap config; pass `planeCredential.verify` into the rpc mount deps (used in Task 6). In `browser-transport.ts`: include `[CONCIV_PLANE_HEADER]: cfg.planeCredential` in the per-call headers alongside the session header.
- [ ] **Step 4: Green + typecheck** `pnpm turbo run typecheck --filter=@conciv/core --filter=@conciv/contract > /tmp/t3.log 2>&1; echo $?` (widget config type change ripples — fix all consumers).
- [ ] **Step 5: Commit** `feat(core): widget plane credential issued at boot, sent per rpc call`.

---

### Task 4: Meta on the core contract + poison exclusions

**Files:**

- Modify: `packages/contract/src/contract.ts` — every procedure gets `.meta({...})` per the spec's classification table; `registry.call` DELETED (its widget call sites move to direct procedure calls — find with `grep -rn "registry.call\|\.call(" apps/conciv/src packages/ui-kit*` and update); `chat.permissionDecision` and `page.reply` get `{agent: false}`.
- Test: `packages/contract/test/contract-meta.test.ts`

**Interfaces:**

- Consumes: `AgentMeta` (Task 1). Contract base becomes `const oc = base.$meta<AgentMeta>({})` locally in `contract.ts` (contract package stays dependency-clean; the gate lives in core).
- Produces: fully-metered contract. Classification is the spec's table verbatim — copy it, don't re-derive. `chat.subscribe` and `page.queries` additionally get `stream: true`.

- [ ] **Step 1: Failing test** — walk the contract with `traverseContractProcedures` and assert: every procedure resolves via `resolveAgentPolicy` without throwing (i.e. summary present or `agent: false`); `chat.permissionDecision` and `page.reply` resolve to `null`; `registry.call` no longer exists; spot-check five access classes:

```ts
import {describe, expect, it} from 'vitest'
import {traverseContractProcedures} from '@orpc/contract'
import {contract} from '../src/contract.js'
import {resolveAgentPolicy} from '../src/agent-meta.js'

const first = {firstParty: true, trusted: false}

function policies() {
  const out = new Map<string, ReturnType<typeof resolveAgentPolicy>>()
  traverseContractProcedures({path: [], router: contract}, ({path, contract: proc}) => {
    out.set(path.join('.'), resolveAgentPolicy(path, proc['~orpc'].meta, first))
  })
  return out
}

describe('contract meta', () => {
  it('every procedure classifies cleanly', () => {
    expect(() => policies()).not.toThrow()
  })
  it('poison procedures are excluded and registry.call is gone', () => {
    const p = policies()
    expect(p.get('chat.permissionDecision')).toBeNull()
    expect(p.get('page.reply')).toBeNull()
    expect(p.has('registry.call')).toBe(false)
  })
  it('spot classifications match the spec', () => {
    const p = policies()
    expect(p.get('sessions.list')?.access).toBe('free')
    expect(p.get('drafts.get')?.access).toBe('ask')
    expect(p.get('sessions.delete')?.access).toBe('ask')
    expect(p.get('chat.subscribe')?.stream).toBe(true)
    expect(p.get('server.transform')?.access).toBe('ask')
  })
})
```

(If `proc['~orpc'].meta` is not the meta access path in our oRPC version, read `node_modules/@orpc/contract/dist` for the real one FIRST — read-dep-source rule — and adjust; `registry-walk.ts` already reads meta, copy its access pattern.)

- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Apply meta to all 40 procedures; delete `registry.call` + its handler in `packages/core/src/api/rpc/router.ts` + widget call sites.** Summaries: one plain sentence each, written as agent documentation (they surface in `external_catalog`).
- [ ] **Step 4: Green: contract tests + full typecheck** (`registry.call` deletion ripples into core and widget — fix all).
- [ ] **Step 5: Commit** `feat(contract): agent meta on every procedure, registry.call deleted`.

---

### Task 5: Catalog walker

**Files:**

- Create: `packages/core/src/gate/catalog.ts`
- Test: `packages/core/test/gate/catalog.test.ts`

**Interfaces:**

- Consumes: `resolveAgentPolicy`, `walkRegistryProcedures` (`packages/extension/src/registry-walk.ts`).
- Produces: `buildCatalog(router: AnyRouter, opts: {firstPartyPaths: (path: readonly string[]) => boolean; trustedExtensions: ReadonlySet<string>}): Map<string, ResolvedAgentPolicy>` keyed by canonical dot-path. Throws on: post-encoding name collision (error lists both dot-paths); missing summary (from resolver). Startup poison assertion: `assertPoisonExcluded(catalog)` throws unless `chat.permissionDecision` and `page.reply` are absent from the map.

- [ ] **Step 1: Failing tests** — build tiny routers with the real oRPC builder: (a) two procedures whose paths encode identically (`['a', 'b_c']` and `['a', 'b', 'c']`) → throws listing both; (b) `ext.foo.*` procedures get `firstParty: false` and ask-always until `trustedExtensions.has('foo')`; (c) poison assertion throws when a procedure named `chat.permissionDecision` lacks `agent: false`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.** `firstPartyPaths`: everything not under `ext.` plus first-party extension slugs (constant list exported from `packages/core/src/gate/catalog.ts`: the extensions in this repo).
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** `feat(core): agent policy catalog walker with collision and poison guards`.

---

### Task 6: gateRouter — enforcement at dispatch

**Files:**

- Create: `packages/core/src/gate/gate-router.ts`, `packages/core/src/gate/approvals.ts`
- Modify: `packages/core/src/api/rpc/mount.ts` (serve wrapped router; construct human principal only when `planeCredential.verify(header)`), `packages/core/src/api/mcp.ts` (agent principal)
- Test: `packages/core/test/gate/gate-router.test.ts`

**Interfaces:**

- Consumes: catalog (Task 5), principals (Task 2), `AskRegistry` (`packages/core/src/chat/ask.ts` — read it first: `open/waitFor/cancel` shapes), `session()`/`withSession` (lane), plane credential verify (Task 3).
- Produces:
  - `gateRouter(router: AnyRouter, catalog: Map<string, ResolvedAgentPolicy>, deps: GateDeps): AnyRouter` — walks `router`, re-creates every leaf with identical input/output/errors PLUS the shared gate errors (`APPROVAL_DENIED`, `APPROVAL_TIMEOUT`, `AGENT_DENIED`, `RATE_LIMITED`, `INVALID_BOUNDS`), handler = `gateThenCall`.
  - `GateDeps = {principalOf: (context: unknown) => Principal | null; asks: AskRegistry; approvals: ApprovalLedger; listening: (sessionId: string) => boolean}`
  - `approvals.ts`: `makeApprovalLedger(): ApprovalLedger` with `acquire(executionId, ask: {procedure: string; digest: string; sessionId: string}): Promise<'allow' | 'deny' | 'timeout'>` — serializes asks per executionId (queue), consumes atomically, `cancelAll(executionId)`. Digest: `JSON.stringify` of the zod-VALIDATED input with sorted keys (`sortKeysDeep` helper in the same file), sha256 hex.
- Gate logic in `gateThenCall` (validated input arrives because the wrapper re-declares the same input schema):
  - no principal → throw `AGENT_DENIED` (absent ≠ human)
  - human → call through
  - agent + no catalog entry (unknown/excluded) → `AGENT_DENIED`
  - agent + `access: 'free'` → call through inside `withSession`
  - agent + `access: 'ask'` → `approvals.acquire(...)`; allow → call through; else throw declared error

- [ ] **Step 1: Failing tests** (the load-bearing ones):

```ts
it('gates a procedure that was built on a bare os base with no middleware', async () => {
  const bare = os.input(z.object({v: z.number()})).output(z.object({ok: z.boolean()})).handler(() => ({ok: true}))
  const wrapped = gateRouter({ext: {rogue: {poke: bare}}}, catalogFor({'ext.rogue.poke': ask}), deps)
  await expect(callAsAgent(wrapped, ['ext', 'rogue', 'poke'], {v: 1}, {deny: true})).rejects.toThrow('APPROVAL_DENIED')
})
it('denies agent calls to procedures absent from the catalog', ...)
it('denies calls carrying a forged plain-object principal', ...)
it('passes human principal without asking', ...)
it('free access passes agent without asking; ask access opens exactly one ask bound to validated-input digest', ...)
it('a second concurrent ask in one execution queues; run cancellation rejects pending asks', ...)
it('nested gated call from within an approved handler raises its own ask without deadlock', ...)
```

Write these fully (arrange with real `os` builders and a stub-free fake AskRegistry backed by the real one from `ask.ts` driven by the test resolving asks).

- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement `gate-router.ts` + `approvals.ts`.** Wrapping: walk with `walkRegistryProcedures`; for each leaf, `implement`/rebuild a procedure from the original's contract (input/output/errors/meta) whose handler calls the original via `createRouterClient(originalRouter, {context})` at the same path. Mount changes: `/rpc`+`/rpc-ws` context carries `principal: verify(planeHeader) ? principals.human() : null`; `/api/mcp` in-process client context carries `principals.agent()`.
- [ ] **Step 4: Green + full core suite.**
- [ ] **Step 5: Commit** `feat(core): dispatch-level permission gate over the composite router`.

---

### Task 7: Agent bridge from the catalog (mcp.ts rewire)

**Files:**

- Modify: `packages/core/src/api/mcp.ts`, `packages/core/src/app.ts`, `packages/core/src/chat/capabilities.ts` (delete `assistCapabilities`), `packages/core/src/chat/code-mode.ts` (drop `gatedToolRun` approval branch — gate now inside the router; keep the listener check)
- Test: `packages/core/test/gate/agent-bridge.test.ts`

**Interfaces:**

- Consumes: catalog, wrapped router, `createRouterClient` with agent principal context.
- Produces: `catalogCapabilities(catalog, client): CodeCapability[]` replacing `codeModeCapabilities` — each entry's `execute` calls `client` at the entry's path inside `withSession(ambient)`; `signature()` from the procedure's schemas; `summary`/`category` from policy. `conciv_ui` and `conciv_extensions` re-registered as procedures on the contract (namespace `assist.`, `conciv_ui` NOT readonly) so they flow through the same path; delete their special-case assembly in `app.ts`.

- [ ] **Step 1: Failing test** — boot a real `makeApp` (existing app test harness — find the pattern in `packages/core/test` and reuse), then: catalog lists `external_sessions_list`; calling it through the sandbox capability path returns session metadata without an ask; calling `external_drafts_set` opens an ask; `external_chat_permissionDecision` does not exist; `assist_conciv_extensions` exists and `assist_conciv_ui` is ask-class.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Green + run the widget integration suite for regressions** (`pnpm turbo run build --filter=@conciv/embed` first — prebuilt-bundle rule — then the core IT suite).
- [ ] **Step 5: Commit** `feat(core): agent capabilities generated from the policy catalog; assist path deleted`.

---

### Task 8: Cross-session guard

**Files:**

- Create: `packages/core/src/gate/cross-session.ts`
- Modify: `packages/core/src/api/rpc/chat.ts` (chat.send/stop handlers consume the guard)
- Test: `packages/core/test/gate/cross-session.test.ts`

**Interfaces:**

- Produces: `makeOriginTracker(opts: {maxDepth: number; maxConcurrentPerOrigin: number}): {admit: (origin: {trace: readonly string[]}, target: string) => 'ok' | 'self' | 'cycle' | 'depth' | 'rate'; release: (target: string) => void}`. `chat.send` input gains optional `origin` trace (populated by the bridge for agent-initiated sends: ambient session appended per hop); handler maps `'self'` → `SELF_TARGET`, `'cycle'`/`'depth'` → `CYCLE`, `'rate'` → `RATE_LIMITED` (declared errors on the chat namespace). Defaults: `maxDepth: 3`, `maxConcurrentPerOrigin: 2`.

- [ ] **Step 1: Failing tests** — self target rejected; A→B→A rejected via trace; depth 4 rejected; third concurrent send from one origin rejected until `release`; human-plane sends (no trace) unaffected.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** `feat(core): cross-session send guard with origin trace`.

---

### Task 9: Bounded stream collectors

**Files:**

- Create: `packages/core/src/gate/collectors.ts`
- Modify: `packages/core/src/gate/catalog.ts` + bridge (Task 7 file) — `stream: true` entries get collector-shaped capabilities
- Test: `packages/core/test/gate/collectors.test.ts`

**Interfaces:**

- Produces: `collectStream(subscribe: (signal: AbortSignal) => AsyncIterable<unknown>, bounds: {limit?: number; timeoutMs?: number}, ceilings: Ceilings): Promise<unknown[]>` with `Ceilings = {maxEvents: 200, maxBytes: 262144, maxDurationMs: 30000, maxConcurrent: 2}` (constants exported). Capability input envelope: `{input: <procedure input>, collect?: {limit?, timeoutMs?}}`. Per-event byte check via `JSON.stringify` length BEFORE accumulation; first ceiling hit stops collection and returns what was gathered (not an error); invalid bounds (≤0, NaN, > ceiling) throw `INVALID_BOUNDS`; unsubscribe guaranteed via `AbortController` + `finally` calling `iterator.return`.

- [ ] **Step 1: Failing tests** — respects limit; respects timeout with a never-ending async generator; per-event byte ceiling stops before accumulating an oversized event; concurrent third collector in one execution throws; generator's `finally` observed to run (cleanup flag); zero/NaN bounds throw `INVALID_BOUNDS`; two sessions collecting concurrently receive only their own events (drive `withSession` around two collectors on a session-filtered source).
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement; wire `chat.subscribe` + `page.queries` through it in the bridge.**
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** `feat(core): bounded stream collectors for event-iterator procedures`.

---

### Task 10: Gate-site collapse + old-path deletion

**Files:**

- Modify: `packages/core/src/chat/gate.ts` (keep Bash command policy for the harness plane; delete registry-name ask path), `packages/core/src/api/rpc/router.ts` (delete `approveAskGatedCall`), `packages/core/src/chat/code-mode.ts` (confirm no approval logic remains), `packages/core/src/app.ts` (`approvalGatedNames` deleted)
- Test: existing suites are the net — this task is deletion + green

- [ ] **Step 1: Delete the three legacy gate paths; fix compile errors.**
- [ ] **Step 2: Full gates:** `pnpm typecheck > /tmp/t10a.log 2>&1; echo $?` then `pnpm turbo run test --filter=@conciv/core --filter=@conciv/contract --filter=@conciv/extension --force > /tmp/t10b.log 2>&1; echo $?` (`--force`: final gates never trust cache).
- [ ] **Step 3: Verify by antipattern grep:** `grep -rn "approveAskGatedCall\|gatedToolRun\|assistCapabilities" packages/ --include="*.ts" | grep -v test` → empty.
- [ ] **Step 4: Commit** `refactor(core): single gate; legacy approval paths deleted`.

---

### Task 11: End-to-end integration test

**Files:**

- Test: `packages/core/test/gate/agent-surface.it.test.ts`

One test file, real app boot, real MCP round-trip (the pattern in the existing mcp integration tests — find and reuse): agent executes sandbox code that (1) catalogs and finds `external_sessions_list`, calls it free; (2) calls `external_sessions_rename` → ask appears on the session stream → test approves via the REAL approval procedure as the widget principal → rename lands; (3) attempts `external_chat_permissionDecision` → not found; (4) fetch to `/rpc` without plane credential + with a session id → mutation denied (no principal); with credential → passes. Steps: write test (fail) → wire whatever integration glue is missing → green → commit `test(core): agent surface end-to-end`.

---

### Task 12: fallow + changeset + docs sweep

- [ ] **Step 1:** `pnpm exec fallow audit --changed-since main --format json > /tmp/fallow.json 2>&1; echo $?` — fix every INTRODUCED finding (deleted paths WILL surface dead exports; trace before deleting: `pnpm exec fallow dead-code --trace <file>:<symbol>`).
- [ ] **Step 2:** Hand-write `.changeset/agent-api-surface-platform.md` naming one `@conciv/*` package, patch, one-paragraph summary.
- [ ] **Step 3:** Final gates: `pnpm typecheck && pnpm build` then `pnpm turbo run test --filter=@conciv/core --filter=@conciv/contract --force`, each redirected to a file with `echo $?`.
- [ ] **Step 4: Commit** `chore: changeset for agent api surface platform`.

---

## Explicitly deferred to Plan 2 (separate document, do NOT start here)

Extension authority rework and facade collapse: whiteboard verb-by-verb migration table (comments, pins, reads, cursor, canvasPending, canvasReplies, elements + bulk; optimistic-sync correlation-key protocol), recorder orchestration procedures, tanstack family merge matrix, terminal router exposure, trusted-extension toggle UI. Plan 2 is written after this plan ships and the session lane's final shapes are known.
