# aidx Adapter Architecture — Plan 5: Widget ↔ Engine Wiring (cross-origin + CORS)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **HARD RULES (see spec "Coding conventions"):** No casts (`as`, except `as const`), no `!`, no IIFEs, no `index.ts`. Zod for all parsed data. h3 **2.0.1-rc.22** (`event.req`, `event.res.status = N`, return objects→JSON, `new Response(stream, {headers})` for SSE). Functions not classes. Terse comments. Commit to `main`. Verify library APIs against real online docs.

**Goal:** Make the in-page widget actually appear and talk to the standalone engine in the example app. The rewrite split the engine onto its own srvx port (cross-origin) but left two halves of the old same-origin design behind: the SSR injection path writes an **empty** `pw-api-base`, and the engine has no working CORS. Net effect: the widget loads, probes `${base}/api/chat/session`, gets a 404 (same-origin) or a CORS block (cross-origin), and `probeChatAvailable` → false → **mounts nothing**. This plan closes the gap by committing to the cross-origin model the engine already implements.

**Decision (locked):** Cross-origin transport. `pw-api-base` points at `http://127.0.0.1:<enginePort>`; the engine answers every route with proper CORS (echoed Origin + credentials + preflight). No vite `/api` proxy is introduced.

---

## Background — the gaps (evidence)

| # | Gap | Evidence |
|---|-----|----------|
| 1 | Two injection paths disagree on `pw-api-base`. `engine.htmlTags` injects the engine port (correct), but it only runs via `transformIndexHtml`, which **does not fire for SSR** (TanStack Start). The path SSR uses — `widget-middleware.widgetTags` — injects `content=""` (same-origin). | `packages/core/src/engine.ts:16` vs `packages/plugin/src/core/widget-middleware.ts` (`widgetTags`) |
| 2 | Structural ordering: in `makeViteHook.configureServer`, `mountWidget(...)` runs **before** `bootEngine(...)`, so the inject middleware cannot know the engine port. | `packages/plugin/src/core/vite.ts` (`configureServer`) |
| 3 | No working CORS on the cross-origin engine. The probe route `/api/chat/session` and history/permission/editor/server routes set **no** CORS headers. The three SSE routes set `access-control-allow-origin: '*'`, which is **invalid with credentials** (`credentials:'include'` / `withCredentials:true`). No `OPTIONS` preflight anywhere. | `app.ts` (no CORS), `api/page/page.ts:16`, `api/chat/turn.ts:96`, `api/test-runner/test-runner.ts:9`; widget uses credentials in `chat-api.ts`, `page-bus.ts:20` |
| 4 | Tests enshrine the bug. Plugin IT asserts `pw-api-base content=""` as correct; widget IT passes `apiBase` directly to a same-origin test server, so cross-origin/CORS is never exercised. Green, but blind to the real failure. | `packages/plugin/test/widget-inject.it.test.ts`, `packages/widget/test/widget.it.test.ts` |

h3 v2 CORS is built in (`handleCors`, `appendCorsHeaders`, `appendCorsPreflightHeaders`, `onRequest`). v2 requires explicit `return` of the handled response. Options: `origin`, `methods`, `credentials`, `preflight.statusCode`, `allowHeaders`, `exposeHeaders`. **`origin: '*'` is illegal with `credentials: true`** — the Origin must be echoed.

---

## Tasks

### Task 1 — Global CORS on the engine (closes Gap 3, JSON routes)

- [ ] Add one app-wide CORS middleware in `packages/core/src/app.ts` using h3's `handleCors` + `onRequest`:
  - `app.use(onRequest((event) => { const res = handleCors(event, opts); if (res !== false) return res }))` so preflight short-circuits. **v2 fact (confirmed at h3.dev/utils/security):** `handleCors` returns `Response | false` — return the Response on a preflight; `false` means "not handled, continue".
  - `opts`: `{origin: <predicate>, methods: '*', credentials: true, preflight: {statusCode: 204}, allowHeaders: '*'}`.
  - **Origin echoing:** do NOT use `'*'` (illegal with `credentials: true` — browser rejects). Use `origin` as a **predicate `(origin: string) => boolean`** (return `true` — dev-only engine, reflects the caller's exact Origin) or a `string[]` allow-list; both forms make h3 emit the matched caller Origin as ACAO. The h3.dev page only shows the `'*'` form, so confirm the predicate/array overload against the current `H3CorsOptions` type before coding (do not grep `.d.ts`).
- [ ] **Acceptance:** new core IT (`test/api/cors.it.test.ts`): an `OPTIONS /api/chat/session` with `Origin: http://localhost:3000` returns **204** with `access-control-allow-origin: http://localhost:3000` and `access-control-allow-credentials: true`; a `GET /api/chat/session` with that Origin returns 200 **and** echoes those two headers.

### Task 2 — CORS on the SSE routes (closes Gap 3, streams)

- [ ] SSE handlers return `new Response(stream, {headers})`, which **bypasses `event.res`** — the global middleware's headers do not reach them. Merge CORS headers into each SSE `Response`'s own headers.
  - Replace the three hand-rolled `'access-control-allow-origin': '*'` literals (`api/page/page.ts`, `api/chat/turn.ts`, `api/test-runner/test-runner.ts`) with echoed-origin + `access-control-allow-credentials: true`.
  - Prefer a shared helper (e.g. `corsHeadersFor(event)` in a small `api/cors.ts`) reused by all three, so the origin-echo logic lives once. The helper derives ACAO from `event.req` Origin and sets allow-credentials.
- [ ] **Acceptance:** core IT: `GET /api/page/stream` (and `/api/test-runner/stream`) with `Origin: http://localhost:3000` returns `content-type: text/event-stream` **and** `access-control-allow-origin: http://localhost:3000` + `access-control-allow-credentials: true`.

### Task 3 — Inject the engine port into the SSR path (closes Gaps 1 & 2)

- [ ] In `packages/plugin/src/core/vite.ts` `configureServer`, **boot the engine first**, then mount the widget with the engine origin:
  - Reorder to `engine = await bootEngine(...)` before `mountWidget(...)`.
  - Pass `apiBase = http://127.0.0.1:${engine.port}` into the inject middleware.
- [ ] In `packages/plugin/src/core/widget-middleware.ts`, change `widgetTags`/`makeWidgetInject` to take `apiBase` and inject `<meta name="pw-api-base" content="${apiBase}">` instead of empty. Keep the escaping + the `body.includes(widgetUrl)` double-inject guard.
- [ ] Unify the two paths: `engine.htmlTags(corePort, …)` and `widgetTags(apiBase, …)` must emit the **same** `pw-api-base`. Confirm `transformIndexHtml` (static apps) and the middleware (SSR apps) can't double-inject — the middleware already skips when the body references `widgetUrl`; verify the meta isn't duplicated when both fire.
- [ ] Update the stale comment in `widget-middleware.ts` ("empty api-base ⇒ same-origin /__pw") — it describes the dead design.
- [ ] **Acceptance:** plugin IT (updated, see Task 4) asserts the injected `pw-api-base` equals the passed engine origin, not `""`.

### Task 4 — Fix the tests that enshrine the bug (closes Gap 4)

- [ ] `packages/plugin/test/widget-inject.it.test.ts`: pass an `apiBase` (e.g. `http://127.0.0.1:12345`) into `makeWidgetInject`; assert `<meta name="pw-api-base" content="http://127.0.0.1:12345">`. Remove the `content=""` assertions.
- [ ] Add the core CORS ITs from Tasks 1 & 2.
- [ ] `packages/widget/test/widget.it.test.ts`: keep the same-origin mount test, but add (or document, if the harness can't do cross-origin) a case where the probe target requires CORS — at minimum assert the probe uses the `pw-api-base` origin, not the page origin.
- [ ] **Acceptance:** `pnpm -r test` green; the suite now fails if `pw-api-base` regresses to empty or CORS is dropped.

### Task 5 — End-to-end verify in the example app (proves the fix)

- [ ] Run `apps/examples/tanstack-start` dev (`vite dev --port 3000`). In a real browser (or playwright):
  - Confirm the widget bundle loads from `/@aidx/widget.js`.
  - Confirm `<meta name="pw-api-base">` is the engine origin (`http://127.0.0.1:<port>`), not empty.
  - Confirm `GET /api/chat/session` succeeds cross-origin (no CORS error in console).
  - Confirm the FAB mounts and the page-bus `EventSource` (`/api/page/stream`) connects.
- [ ] **Acceptance:** the FAB is visible and the network panel shows a 200 (not blocked) `session` probe + an open `page/stream`. Capture a screenshot/console as evidence (verification-before-completion).

---

## Out of scope
- The same-origin vite-proxy alternative (rejected; cross-origin chosen).
- Widget UI/feature work — this plan only restores the transport so the widget renders at all.
- Non-vite bundlers (`boot.ts` path) — HTML injection there is the host's job; CORS from Task 1/2 still applies if those engines are reached cross-origin.

## Risk notes
- Origin echoing on a dev-only engine is acceptable; do not ship a wildcard-credentials combo (browser will reject it silently).
- `127.0.0.1` vs `localhost` are distinct origins — echoing the caller's Origin handles either; do not hardcode one.
- h3 v2 is RC: verify `handleCors`/`onRequest` exact signatures + the `origin`-reflection form against current online docs before implementing (do not grep `.d.ts`).
