# Widget Rewrite Plan 4: typed rpc everywhere — page/server verbs, CLI client, extensions phase

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the last conciv-owned REST surfaces. `/api/page/:verb` (+ `/changes`) and `/api/server/*` become contract v5 rpc namespaces consumed by the conciv CLI through the typed oRPC client; the extensions phase moves `/api/ext/<id>` sub-apps to extension-contributed oRPC routers mounted under `/rpc/ext/<slug>` and re-homes `ExtensionHostContext.client` from the REST-era `SessionClient` onto the typed rpc client. After this plan the ONLY non-rpc HTTP left is `/api/mcp` (MCP protocol, permanent) and the terminal extension's WebSocket (byte stream, kept by design).

**Interface lock (user, 2026-07-11):** the contract v5 shape below was proposed and locked with "go". Extensions phase = extension-contributed oRPC routers at `/rpc/ext/<slug>`; terminal keeps its WS.

## Global Constraints

- Behavior-preserving for the CLI: `conciv page <verb> …` and `conciv server …` keep their exact argv surface and print the same JSON payloads (agents parse this output; the system prompt/tool descriptions reference these commands). Only the transport changes.
- v0: no back-compat shims. Deleted routes are deleted in the same task that re-homes their callers; every call site updated.
- Functions not classes; ZERO comments; no `any`/`as`/non-null `!`; no IIFEs; cyclomatic ≤ 4 for new code. oxfmt/oxlint clean.
- Tests: no doubles/shims — real served core via `@conciv/harness-testkit` (+ `createFakeHarness`); real browser (Playwright/Chromium, `browser.newPage()`, `domcontentloaded`, never `networkidle`) for anything DOM; assertions via observable behavior. zod validates every wire boundary.
- Commit per task with pathspec. `pnpm exec fallow audit --changed-since main --format json`: zero newly-INTRODUCED dead code (complexity inherited by the plan-3 page port is a known open item, not this plan's). Known non-gating red: claude-image + codex live ITs.
- prek hook race recovery: retry the commit or `--no-verify` after the hook's oxfmt pass; NEVER bare `pnpm format`.

## Verified facts (2026-07-11, read from source)

- `/api/page` (core `src/page/page.ts`): `GET /changes` → `journal.list()` (ChangeEntry[]), `POST /changes/clear` → `{ok:true}`, `GET|POST /:verb` → zValidator(PageQueryInputSchema) → `runVerb` = `bus.ask({kind, ...input})` + journal.append for `isMutating(verb)` + locate-symbolication (`symbolicateFrames(frames, root)` when `!data.source && Array.isArray(data.frames)`). Errors: HTTPException 503 `'no widget connected'` (no subscribers), 504 `'page did not reply (no widget connected?)'` (timeout; per-query `timeout + 1000` else 5000ms) — exact strings, they are the parity target.
- CLI error behavior TODAY (review-verified): `cli-http.ts` `sendJson` never checks `res.ok` — on 503/504 it prints the plaintext HTTPException body to STDOUT and exits 0. There is no non-zero exit to preserve.
- `PageQueryInputSchema` already carries `since`/`timeout`/`hookId`/`path`/`target`/`json`/`action` etc. (page-types.ts:92-125) — every CLI `FIELD` is a subset; `PageRunInputSchema = PageQueryInputSchema.extend({verb})` loses nothing (tools' PageInput re-declares three of them redundantly).
- `RpcDeps` ripple check: `makeRpcRouter` is constructed ONLY at `app.ts:240`; harness-testkit never builds `RpcDeps` — adding `journal`/`pageRoot`/`bundlerBridge` does not ripple. During the Task-1 co-existence window the SAME `makeJournal()` instance must feed both the Hono `PageVars` and `RpcDeps`, or `page changes` diverges by transport.
- oRPC mechanics (review-verified in node_modules): contract-free routers built with the plain `os` builder mount fine — `RPCHandler` takes `Router<any, T>`; `AnyRouter` and `RouterClient` are exported from `@orpc/server`; `createORPCClient<T>` infers NOTHING from a URL (the caller must supply the router client type). Page replies are JSON-safe records; `z.record(z.string(), z.unknown())` strips nothing and key order survives the codec, so `JSON.stringify(result)` matches today's `c.json` bytes.
- oRPC event iterators over RPCLink do NOT auto-reconnect (native EventSource does) — reconnection is the opt-in `ClientRetryPlugin` (`@orpc/client/dist/plugins`) with `retry`/`onRetry` hooks.
- `/api/server` (core `src/bundler/bundler.ts`): GET config/resolve?spec&importer/graph?file/transform?url/urls, POST reload{file}/restart{force} — all thin calls on `BundlerBridge` (`@conciv/protocol/bundler-types`, plain TS types today, NO zod schemas); HTTPException 503 'no bundler bridge' when absent.
- Consumers of these routes: `packages/cli/src/page.ts` + `server.ts` ONLY (via `request.ts` → `cli-http.ts` `sendJson` + `defaultOrigin()`), plus tests (`packages/core/test/rpc/wire.it.test.ts` drives `/api/page/snapshot` via `kit.post`; `packages/embed/test/page-plane.it.test.ts` drives `/api/page/text` + `/snapshot`). The `conciv_page` MCP tool does NOT go through HTTP — it calls `ctx.page` (pageBus.ask) in-process (`packages/tools/src/page.ts` + core tools wiring) and is untouched by this plan.
- CLI `PAGE_VERBS` table (page.ts) maps every `PageQueryKind` to GET/POST + flags; `pageRequest` builds querystring (GET) or JSON body (POST) from `FIELD`-validated args. The GET/POST split becomes meaningless over rpc — the argv surface must not change.
- oRPC mount (`core/src/rpc/mount.ts`): `os = implement(contract).$context<RpcContext>()`, single `RPCHandler` with `prefix: '/rpc'` behind Hono middleware. Extension routers need their OWN handlers (they are not part of `contract`): one `RPCHandler(extRouter)` per extension with `prefix: '/rpc/ext/<slug>'`, mounted in `app.ts` where `/api/ext/<slug>` is mounted today (line ~262).
- Extension server contract (`packages/extension/src/types.ts`): `defineExtension().server(factory)` returns `ServerResult = {context, app?: unknown, turnEnd?, dispose?}`; `app` is a Hono sub-app mounted at `/api/ext/<slug>`. Server-side users: terminal (Hono + `hc` typed client + WS at `/api/ext/terminal/…`), whiteboard (`whiteboardApp` Hono routes incl. SSE), test-runner (check during execution).
- Client-side `ExtensionHostContext.client: SessionClient` uses: terminal-panel-view (`sessionId()`, `chatHeaders()` for WS url + hc calls), terminal-actions (`models()`, `launch()`, `sessionId()`), whiteboard client (grab only). `SessionClient` is implemented in the app by `makeSessionClient` (rpc adapter, plan 3) and in extension-testkit by `makeRpcSessionClient`.
- `@conciv/protocol/page-types`: `PageQueryInputSchema` = `PageQuerySchema.omit({kind, requestId})`; results are loose `Record<string, unknown>` (no result schema exists; PageResult is `ok/err` helpers). Journal `ChangeEntry = {seq, ts, verb, ref?, selector?, args}` (`core/src/page/journal.ts`, no zod schema yet).
- CORS: rpc middleware is mounted after corsMiddleware; loopback origins allowed — CLI hits the same origin resolution as today (`cli-http.ts` `defaultOrigin()` reads the port file/env; verify exact mechanism when editing).

## Locked interfaces

```ts
// contract v5 — packages/contract/src/contract.ts (+ protocol schemas)
page: {
  // replaces GET|POST /api/page/:verb; journal append + locate symbolication stay server-side in the handler
  run: oc
    .errors({
      NO_PAGE_CLIENT: {message: 'no widget connected'},                      // EXACT current 503 string (SND-1)
      PAGE_TIMEOUT: {message: 'page did not reply (no widget connected?)'},  // EXACT current 504 string (SND-1)
    })
    .input(PageRunInputSchema)                      // PageQueryInputSchema.extend({verb: PageQueryKindSchema})
    .output(PageRunResultSchema),                   // z.record(z.string(), z.unknown()) — page replies are driver-shaped
  changes: oc.output(z.array(PageChangeEntrySchema)),  // {seq, ts, verb, ref?, selector?, args}
  clearChanges: oc.output(Ok),
  queries: …unchanged from v4…,                     // browser half stays
  reply: …unchanged from v4…,
},
server: {
  // replaces /api/server/*; all carry NO_BUNDLER
  config: oc.errors(noBundler).output(BundlerConfigSchema),
  resolve: oc.errors(noBundler).input(z.object({spec: z.string(), importer: z.string().optional()})).output(z.object({id: z.string().nullable()})),
  graph: oc.errors(noBundler).input(z.object({file: z.string()})).output(z.array(ModuleNodeSchema)),
  transform: oc.errors(noBundler).input(z.object({url: z.string()})).output(z.object({code: z.string().nullable()})),
  urls: oc.errors(noBundler).output(z.object({local: z.array(z.string()), network: z.array(z.string())})),
  reload: oc.errors(noBundler).input(z.object({file: z.string()})).output(Ok),
  restart: oc.errors(noBundler).input(z.object({force: z.boolean().default(false)})).output(Ok),
}
// protocol: bundler-types.ts gains BundlerConfigSchema + ModuleNodeSchema (types re-derived via z.infer, BundlerBridge unchanged);
// page-types.ts gains PageChangeEntrySchema + PageRunInputSchema/PageRunResultSchema.

// packages/cli — request.ts replaced by a thin rpc runner; argv surface identical
// MUST catch ORPCError: print error.message to STDOUT and exit 0 — that is today's behavior
// (sendJson prints the HTTPException body without checking res.ok; an uncaught rejection under
// citty would print a stack to stderr and exit 1 = a hard divergence). (SND-1)
export function runRpc<T>(call: (rpc: RpcClient) => Promise<T>): Promise<void>

// extensions phase — packages/extension/src/types.ts
import type {AnyRouter} from '@orpc/server'   // (SND-2: Record<string,unknown> is not assignable to RPCHandler's Router<any,T> without a banned cast)
export type ServerResult<Context> = {
  context: Context
  router?: AnyRouter                 // built with the plain `os` builder; mounted at /rpc/ext/<slug>
  app?: unknown                      // Hono escape hatch KEPT for byte streams (terminal WS + terminal /mirror SSE if not migrated) — still mounts at /api/ext/<slug>
  turnEnd?: (sessionId: string) => void | Promise<void>
  dispose?: () => void | Promise<void>
}

// extension client helper — MUST be generic or the client is untyped (SND-3):
// each extension client `import type`s its router type from the server module (erases at build)
export function makeExtRpcClient<TRouter extends AnyRouter>(apiBase: string, slug: string): RouterClient<TRouter>
// ExtensionHostContext: client: SessionClient DIES →
//   rpc: RpcClient                  // the app's typed client (same instance the routes use)
//   sessionId: () => string | null  // the pane's active session
//   apiBase stays (WS urls + /rpc/ext fetch clients)
```

Behavior contracts (test targets):

- `conciv page <verb>`, `conciv react <verb>` (same page-verb table — COV-8), `conciv page changes [--clear]`, `conciv server config|resolve|graph|transform|urls|reload|restart`, `conciv tools open` print byte-identical JSON payloads vs today. Success = compact `JSON.stringify(result)`. Error = the compact `{"message":"<text>"}` envelope (today's `app.ts` onError `c.json`) printed to STDOUT with EXIT CODE 0 — today's `runAndPrint` never fails the process (COV-3/SND-1). The 503/504/NO_BUNDLER message TEXTS are the exact current strings.
- Mutating verbs still land in the journal; `locate` still symbolicates frames server-side.
- No page client connected → NO_PAGE_CLIENT; page timeout → PAGE_TIMEOUT (per-query `timeout + 1000` grace preserved); no bundler → NO_BUNDLER.
- Terminal extension: WS byte stream (`/tty`) unchanged; its plain-JSON endpoints (`/open`, `/close`, `/state`) move to its `/rpc/ext/terminal` router; `/mirror` (SSE today) becomes an oRPC event iterator on the router with the session id an explicit input (COV-4/SND-5) — mirror-rail's dropped-connection behavior preserved via ClientRetryPlugin.
- Whiteboard + test-runner extension surfaces reachable at `/rpc/ext/<slug>` with their existing behaviors; whiteboard change feed keeps its reconnect-and-refetch semantics (SND-4) and the element-upsert 409 conflict becomes a typed `CONFLICT` error carrying the current row (SND-5).

---

### Task 0: protocol schemas — bundler + page journal

**Files:** `packages/protocol/src/bundler-types.ts` (BundlerConfigSchema, ModuleNodeSchema; re-derive `BundlerConfig`/`ModuleNode` via `z.infer`, keep `BundlerBridge`/`defineBundlerBridge` as-is), `packages/protocol/src/page-types.ts` (PageChangeEntrySchema, PageRunInputSchema = `PageQueryInputSchema.extend({verb: PageQueryKindSchema})`, PageRunResultSchema).

- [ ] Schemas + type re-derivation; `pnpm turbo run test --filter=@conciv/protocol` green; commit.

### Task 1: contract v5 + core handlers + wire ITs

**Files:** `packages/contract/src/contract.ts` (page.run/changes/clearChanges + server namespace per the lock), `packages/core/src/rpc/router.ts` (handlers: page.run = the current `runVerb` body — journal append on `isMutating`, locate symbolication, HTTPException 503/504 → typed NO_PAGE_CLIENT/PAGE_TIMEOUT; server.\* = thin BundlerBridge calls, absent bridge → NO_BUNDLER), `RpcDeps` gains `journal`, `pageRoot`, `bundlerBridge` (or a single `page: PageVars['page']` + `bundler` bag — mirror how `app.ts` builds the Hono vars today).
**Do NOT delete the REST routes yet** — this task lands the rpc surface next to them so the CLI task can switch atomically.

- [ ] Wire ITs in `packages/core/test/rpc/wire.it.test.ts`: page.run text/snapshot round-trip via the rpc page.queries subscriber; mutating verb lands in page.changes and clearChanges empties it; NO_PAGE_CLIENT with no subscriber; server.\* against a stub-free real bridge if available in kit, else NO_BUNDLER paths (bootKit has no bundler → typed error is the honest assertion; positive-path bundler coverage lives in the plugin's existing vite IT if one exists — verify, else add one there).
- [ ] `pnpm turbo run test --filter=@conciv/core` green; commit.

### Task 2: CLI on the typed client

**Files:** `packages/cli/src/request.ts` (rpc runner replaces path-building; keep `defaultOrigin()`), `page.ts` (PAGE_VERBS loses `method`, `pageRequest` builds a `PageRunInput`; `changes`/`--clear` → page.changes/clearChanges; the `react` command rides the same table — COV-8), `server.ts` (subcommands → server.\* calls), **`open.ts` (COV-1: `conciv tools open` POSTs `/api/editor/open`, a route that is NOT mounted in composeRoutes — the command 404s today; migrate to the existing `rpc.editor.open`)**, `cli-http.ts` (delete `sendJson` if unused after; keep origin resolution).
**Output parity (COV-3):** success prints compact `JSON.stringify(result)`; `runRpc` catches `ORPCError` and prints compact `{"message": error.message}` to STDOUT then exits 0 — matching today's onError envelope + `runAndPrint` never rejecting. An uncaught rejection under citty (stack to stderr, exit 1) is a hard divergence and a defect.

- [ ] CLI IT rewrite (COV-7): `packages/cli/test/cli.it.test.ts` asserts exact `{method, url}` request shapes today (`GET /api/server/graph?file=…`, `POST /api/page/fill`, …) — those URLs cease to exist. Rewrite onto rpc-call assertions or a real served-core round-trip (testkit + a page.queries subscriber answering); keep at least one output-format assertion (compact JSON + `{"message":…}` error envelope + exit 0).
- [ ] Commit.

### Task 3: delete the REST surfaces + re-pin tests

**Files:** delete `packages/core/src/page/page.ts`'s Hono app export (keep `makePageBus`/`pageQueryStream`/`PageBus` — move them if the file dissolves), delete `packages/core/src/bundler/bundler.ts` Hono app (keep the `BundlerVars` seam or inline into rpc deps), remove both `app.route('/api/page'|'/api/server', …)` lines in `app.ts`.
**Re-pins:** `packages/core/test/rpc/wire.it.test.ts` page test (`kit.post('/api/page/snapshot')` → `rpc.page.run`), `packages/embed/test/page-plane.it.test.ts` (`kit.post('/api/page/text'|'/snapshot')` → `rpc.page.run`) — the embed IT's assertion that the BROWSER page plane executes verbs is unchanged, only the asking transport moves.

- [ ] `grep -rn "api/page\|api/server"` across packages/apps returns only `/api/ext` + docs; repo test green; commit.

### Task 4: extensions phase A — oRPC routers at /rpc/ext/<slug>

**Files:** `packages/extension/src/types.ts` (`ServerResult.router?: AnyRouter` per the lock; `app?` stays for byte streams), `packages/core/src/app.ts` (for each entry with `router`, mount `new RPCHandler(router)` middleware at `/rpc/ext/<slug>`; `app` entries keep `/api/ext/<slug>`), extension catalog description text updated, `makeExtRpcClient<TRouter>(apiBase, slug)` in `@conciv/extension/client` (generic — SND-3) with `ClientRetryPlugin` installed and an `onRetry` hook surfaced (SND-4).
**Terminal split (COV-4):** `/tty` WS stays on `app`; `/open`, `/close`, `/state` move to the terminal router; `/mirror` (streamSSE today, consumed by `mirror-rail.tsx` `connectMirror` via raw streamed fetch + `chatHeaders()`) becomes an event-iterator procedure taking `{sessionId}` explicitly — rewrite `connectMirror` onto the ext client, preserving the dropped/reconnect UI signal via `onRetry`.
**Whiteboard (COV-5/SND-4/SND-5):** the real client surface is `client/whiteboard-collection.ts` (loadUrl GET + per-table POST/PUT/DELETE + `elements/:scope` GET/PUT/bulk/bulk-delete), `db.tsx` `postCursor`, and `change-feed.ts` (native EventSource w/ auto-reconnect + `onReconnect` refetch signal + multiplexed event names). Migration spec: each table op becomes a router procedure the collection `sync`/`onInsert`/`onUpdate`/`onDelete` handlers call; the change feed becomes ONE event-iterator yielding a `{channel: 'cursor' | <table>, message}` union, with `ClientRetryPlugin` `onRetry` bridged to the existing `onReconnect` semantics; the element-upsert 409-with-`{current}` reconcile signal becomes a typed `CONFLICT` error carrying the current row via `errors({CONFLICT: {data: …}})` + `isDefinedError` on the client (NOT a thrown failure path). This is a real client rewrite — budget it as such.
**Test-runner:** inventory its server surface first; its HTTP endpoints move to a router; **its tool CARD (`src/tool/card.tsx`) POSTs `${apiBase}/api/editor/open` — a dead route (COV-2); re-point it in Task 5's ToolViewCtx work.**

- [ ] Core IT for the new seam (COV-6): a fixture extension contributing a `router` mounts and round-trips a procedure through `/rpc/ext/<slug>` (extend `packages/core/test/api/extension-app.it.test.ts` family).
- [ ] Extension ITs (extension-testkit) re-pinned; terminal WS IT untouched and green; commit.

### Task 5: extensions phase B — hooks-only host API (AMENDED, user-locked 2026-07-11 session 2)

**Execution order amendment: this task runs FIRST, before Tasks 0-4.** Terminal/whiteboard keep their REST/hc clients (via `apiBase`) until Task 4 migrates them.

**Hooks-only access (supersedes the bag reshape below; hook list user-locked 2026-07-11 session 2):** every host capability is reachable EXCLUSIVELY through granular context-backed hooks — no bag objects, no module singletons, no direct handles. Grounded in the real consumer inventory (terminal: client/apiBase/notify/view; whiteboard: grab/toast/surface/activeSession/suppress; test-runner: view/openEditor; highlight: app-internal):

- `@conciv/extension` consumer surface — 10 hooks: `useRpc`, `useSessionId`, `useApiBase`, `useToast` (absorbs composer `notify`), `useGrab`, `useSurface`, `useOpenEditor`, `useViewLock`, `useLeaveView`, `useComposerInsert`; 4 components: `<Suppress when>`, `<YieldFocus when>`, `Dialog`, `Popover` (layer-tracked); per-extension state via `extension.useContext(selector?)` which now returns ONLY the extension's own client value (host-bag merge gone) + existing `extension.useSlot()`. Internal wiring = private unexported Solid contexts.
- DROPPED from the public api (no consumers): page inspection (`elementAt/describe/locate`), `openSource`, `requestMeta`, `env`, composer actions `insert/setBusy/addDivider/compact/resetUsage`. The app-internal highlight extension imports `@conciv/page` directly.
- Extensions gain a `Surface?: Component` slot rendered persistently (Show-gated) in the extension's effects slot under full providers — whiteboard's imperative `mountOverlay` island and its hand-rolled `EnvironmentProvider(() => layer.getRootNode())` die; overlays are in-tree.
- `.client()` factories become pure state factories (signals/actions only, zero host access) → run at boot; `instances` becomes a static array on the router context (mount-time signal deleted).
- `ClientApi`, `installClientApi`/`runWithClientApi`, the `ExtensionHostContext` bag, `apps/conciv/src/extension/host-bag.ts` and `session-client.ts` ALL DIE.
- Core app same pattern: the `useApp()` bag dissolves into granular hooks (`useRpc`/`useSettings`/`useLayers`/`useAnnounce`/`useAppData`/`useInstances`/`useSuppressed`/`useFabPosition`); all app consumers re-pointed.
- `sessionId` flows DOWN from the pane's context — Components pass it into extension actions (`toggle(sessionId)`); `ClientApi.activeSession` dies.

**Original files list (mechanics still apply where not superseded):** `packages/extension/src/types.ts` (`client: SessionClient` → hooks), terminal-panel-view/terminal-actions (models/launch/sessionId via rpc; WS url keeps `apiBase` + sessionId; `chatHeaders()` uses die — WS/router calls carry the session id explicitly), whiteboard client, `packages/extension-testkit` host (`rpc-session-client.ts` dissolves into passing the kit's rpc).
**ToolViewCtx (COV-2):** tool cards only see `ToolViewCtx` (`apiBase` — no client); the test-runner card's `${apiBase}/api/editor/open` POST is dead today. Give `ToolViewCtx` an `openEditor: (file: string, line?: number) => void` seam (protocol type change) wired to `rpc.editor.open` by both the app pane and extension-testkit host; re-point the card.
**Then check:** `SessionClient` type in `@conciv/protocol/chat-types` — verified sole consumers are extension types + extension-testkit + apps/conciv host-bag; after this task delete the type (fallow confirms).

- [x] Extension browser ITs green; app typecheck/tests green; commit.

**Task 5 EXECUTED (2026-07-11 session 3, commits 5f889b5..fd594e1).** Deviations from the locked list: `useSurface` shipped as `useSlot` (slot discriminator, same role); `useDialog`/`usePopover`/`useNewSession` added (real consumers: composer/session-selector); `useApiBase` retained for the terminal WS url. Root-cause note for the dev-browser blocker this task hit: HostApiProvider's context-value getter destructured `props` to drop `children`, which _invoked_ the `children` getter and rendered the whole subtree during the context-value computation — before Solid's Provider had written the context entry — so every hook threw 'used outside a host' and the subtree also rendered twice. Fix: `splitProps(props, ['children'])` (never touch `props.children` inside the value computation). Full browser walk verified: FAB/panel, Alt+k quick terminal, canvas from quick, composer extension buttons, Alt-hold highlight — zero console errors.

### Task 6: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (environmental reds excepted); fallow zero newly-INTRODUCED.
- [ ] `grep -rn "api/page\|api/server\|api/editor"` across packages/apps returns nothing but docs (COV-1/2 widened the old grep gate).
- [ ] `conciv page` / `conciv react` / `conciv server` / `conciv tools open` manual smoke against a running example app (output parity spot-check incl. error envelope + exit code 0).
- [ ] Memory update (plan 4 executed + findings).

---

## Review ledger (2026-07-11, two Opus adversarial agents: coverage + soundness; ALL findings folded above)

- **COV-1 HIGH** `conciv tools open` is a third CLI REST consumer (`cli/src/open.ts` → `/api/editor/open`, a route NOT mounted — 404s today) → Task 2 migrates it to `rpc.editor.open`.
- **COV-2 HIGH** test-runner card POSTs the same dead `/api/editor/open`; cards only see `ToolViewCtx` → Task 5 adds the `openEditor` seam and re-points the card; grep gate widened to `api/editor`.
- **COV-3 HIGH / SND-1 HIGH** error/exit parity was self-contradictory: today errors print the compact `{"message":…}` onError envelope to STDOUT and EXIT 0 (`sendJson` never checks `res.ok`; `runAndPrint` never rejects) → contract error strings pinned to the EXACT current 503/504 texts; `runRpc` catches ORPCError, prints the same envelope, exits 0.
- **COV-4 MED / SND-5 LOW** terminal `/mirror` is SSE (neither WS nor hc) → assigned: event-iterator procedure w/ explicit sessionId; mirror-rail rewritten on the ext client + `onRetry`.
- **COV-5 MED / SND-4 MED** whiteboard client surface = whiteboard-collection.ts + db.tsx postCursor + change-feed.ts (EventSource auto-reconnect + onReconnect refetch + multiplexed event names) → full migration spec written into Task 4 (per-table procedures, single union event iterator, ClientRetryPlugin bridge, 409 → typed CONFLICT carrying `{current}` via isDefinedError).
- **COV-6 MED** core `/rpc/ext/<slug>` mount seam had no test → core IT added (fixture extension router round-trip).
- **COV-7 MED** `cli.it.test.ts` asserts `{method, url}` shapes that cease to exist → explicit rewrite spec (rpc-call or served-core assertions + output-format pins).
- **COV-8 LOW** `conciv react <verb>` added to the parity target list.
- **SND-2 MED** `ServerResult.router: Record<string, unknown>` not assignable to `RPCHandler`'s `Router<any,T>` without a banned cast → `AnyRouter` (exported by @orpc/server).
- **SND-3 MED** `makeExtRpcClient` must be generic (`RouterClient<TRouter>`) — `createORPCClient` infers nothing from a URL; extension clients `import type` their router type from the server module.
- Reviewer-verified sound: PageRunInputSchema loses no CLI fields (PageQueryInputSchema already carries since/timeout/hookId/…); RpcDeps amendment has no testkit ripple (makeRpcRouter built only in app.ts) but the Task-1 window must share ONE journal instance across both transports; contract-free `os` routers mount via per-extension RPCHandler; page payload serialization is byte-stable through the oRPC codec; `defaultOrigin()` works as-is; SessionClient consumer inventory matches Task 5.
