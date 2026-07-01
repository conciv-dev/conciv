# Whiteboard → New Extension API Migration Plan (v2, post-review)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task, TDD, checkpoint between phases. Work **inline** (no dispatched subagents — house rule [[work-inline-not-subagents]]). Steps use checkbox (`- [ ]`).

**Goal:** Re-home `@conciv/whiteboard` (canvas, comments, pins, anchoring) onto main's rewritten extension architecture: an extension owns its own H3 routes (`/api/ext/<name>/*`), tools carry an injected DI context + per-request session, overlays render via the client factory, and core has no effect/sync/db platform.

**Architecture:** Main replaced `@conciv/extensions` with `@conciv/extension`: `defineExtension({name, configSchema, tools, systemPrompt, Component}).client(factory).server(factory)`. `.server()` gets `{config, cwd, app: H3}` (sub-app at `/api/ext/<name>/*`) and returns `{context, dispose}`; tools execute with that context. `.client()` runs at widget mount, reads `useClientApi()`, renders overlays into `surface()`. Built-in extensions are workspace packages registered by hardcoded import in `packages/plugin/src/core/extensions.ts` (server `builtinExtensions` + `BUILTIN_CLIENT_ENTRIES` + `extensionsModuleSource()`); there is **no** `packages/*` auto-discovery. Main never had `sync`/`db` — we move that machinery **into the whiteboard extension**, hosted on its own `server.app`, and add session-threading + self-declared approval to the contract.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (island, light DOM via `<Portal>`), Yjs + `y-websocket` + `y-indexeddb` (extension-owned WS on `server.app` via `attachWebSocket`/crossws), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection` (extension-owned routes + a trailbase child supervised by `.server()`), `oxc-parser` + shell `git` (anchoring), h3, zod.

## Reviewed (5 review agents, 2026-06-26)

Architecture is sound; this v2 folds in the blockers they found. Confirmed: contract shape correct; crossws survives `withBase` (h3 `defineWebSocketHandler` 426 Response passes through `prepareResponse` + `withBase`, and `attachWebSocket` resolves `Response.crossws`); `ClientApi.client.sessionId()` is a reactive Solid signal (resolves the session open-question — NOT a new gap); G2 native-gate reuse is correct and non-redundant; `allowedTools` short-circuits `canUseTool` (so dropping the blanket allow makes the gate fire, without hiding the tools).

## Grounding (read before starting)

- Reference extension (the template): `git show origin/main:packages/extensions/test-runner/src/{server.ts,client.ts,shared/meta.ts,tool/def.ts,tool/server.ts,tool/client.ts}` and its `package.json` (`.` = server, `./client` = client exports). Built-in client overlay: `packages/widget/src/extensions/highlight.tsx` (`createRoot` + `{value, dispose}` + `render(()=><C/>, api.surface())`).
- Contract: `git show origin/main:packages/extension/src/{define-extension,define-tool,types,extension-api,collect-client}.ts`.
- Core wiring: `app.ts` (`__server` factories; `makeExtensionApp` mounts `/api/ext/<name>`; extension tools → MCP), `extension-app.ts` (sub-app + origin guard), `api/mcp/mcp.ts` (`buildServer` reads `sessionIdFromHeaders`; today calls `tool.execute(args)` with **no** request/previewId), `api/chat/permission.ts` (native gate, hardcoded `toolName !== 'Bash'`), `api/ws.ts` (`attachWebSocket`), `config.ts` (`previewId`), `runtime/ui-bus.ts` (`injectApproval`).
- Built-in registration: `git show origin/main:packages/plugin/src/core/{extensions.ts,boot.ts,vite.ts,split-extension.ts}`.
- Widget IT harness on main: `packages/widget/test/helpers/{widget-server.ts,instances.ts}` (`startWidgetServer` — `serveWidgetAsset` is GONE).
- Our code to port/re-home (working tree): `packages/core/src/{sync,db}/*` (move), `packages/plugin/src/core/services.ts` (DELETE — see Task 0.2), `packages/whiteboard/**` (port), `packages/whiteboard/test/helpers/{boot-stack,run-tool,page}.ts` (rewrite — Task 2.3).
- Harness session header (our fix, LOST on main): `packages/harness/src/claude/{args.ts,sdk.ts}`, `packages/protocol/src/harness-types.ts`. Re-apply (Task 1.0).
- Memory: [[agent-mcp-needs-session-header]], [[excalidraw-needs-light-dom]], [[excalidraw-initialdata-clobbers-seed]], [[native-approval-hybrid]], [[no-tool-registry-self-describe]], [[no-stubs-or-mocks]], [[test-assertions-native]], [[no-abbreviated-names]], [[work-inline-not-subagents]], [[use-turbo-build]], [[kill-server-listen-only]].

## Global Constraints (every task)

- **Code style (hard):** functions not classes (lone exception: `island.tsx`'s React error boundary); NO IIFE; ZERO narration comments (short ones only where earned); no `any`; no casts except a localized assertion at a third-party branded-type boundary; no `else`; functional; **spell names out fully** ([[no-abbreviated-names]]).
- **Deps:** all present & approved. STOP and ask before adding any dependency.
- **Testing:** real `trail` + real Chromium (`browser.newPage()`, never `newContext()`); no mocks/jsdom/stubs. Native assertions; **vitest `expect` has no `toBeVisible`/`toBeAttached` — use Playwright `locator.waitFor({state})`**; `getByRole` does not pierce the effects shadow. Run with `SKIP_STORYBOOK_TESTS=1`; fresh `getPort()` per suite.
- **Build/typecheck:** turborepo from the worktree root. Rebuild whiteboard + widget before a widget IT after editing whiteboard src.
- **Commits:** TDD per step. `oxfmt` reformats on first commit — `git add -A` and re-run the SAME commit. **The pre-commit hook needs `prek`: run commits as `PATH="$PWD/node_modules/.bin:$PATH" git commit …`** (the hook hardcodes a stale prek path and falls back to PATH). End every message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Workflow:** every command from the worktree; never `cd` to the main repo. Kill dev servers by LISTEN pid only.
- **Decided design (locked):** G1 thread `{sessionId, previewId}` into extension tool execute via `mcp.ts`; G2 reuse the native gate (tools self-declare `approval:'ask'`, generalize the one Bash line, drop blanket `allowedTools` on BOTH transports, CLI matcher `mcp__conciv__.*`); G3 the client POSTs to the extension's own `/api/ext/whiteboard/*` action routes (server shares pure functions between MCP tools and routes); overlay = light-DOM `<Portal>` for Excalidraw + `surface()` (shadow) for pins/thread; session via `api.client.sessionId()`.

---

## STATUS

Not started. HEAD = `f7523a4` (this plan). Target = `origin/main` (63 commits ahead; deleted `@conciv/extensions`, the effect system, `/api/tools/run`; rewrote contract; no core sync/db). Trial merge (from HEAD) gave 26 conflicts — but reviews found the real risk is **non-conflict** breakage (`plugin/services.ts`, shared test helpers, lost harness session header, rewritten `tool-ui`/`protocol`/`grab`). Re-run the trial merge at the start of Phase 0 to refresh the conflict set.

**Deferred (out of scope here):** original-plan Phases 5–7 (drift doctor + `conciv doctor` CLI, cross-store undo/redo, limits/empty-state/`solid-sonner` toasts/a11y/security IT/SKILL.md) were never started (no commits). They are NOT ported in this migration. Note for whoever picks them up: cross-store undo depended on a core `History` capability that main never had and this migration deletes — it must be re-homed into the extension or dropped; the `conciv doctor` CLI must target main's rewritten CLI.

---

## Phase 0 — Merge main + land on the new platform (broken whiteboard expected)

### Task 0.1: Preserve sync/db, merge, resolve toward main

**Files (refresh the set):** re-run `git merge origin/main --no-commit --no-ff` and `git diff --name-only --diff-filter=U`.

- [ ] **Step 1:** `git mv` is unavailable mid-merge, so snapshot sync/db first: `mkdir -p .migration-stash && cp -r packages/core/src/sync packages/core/src/db .migration-stash/ && git ls-files packages/core/src/sync packages/core/src/db > .migration-stash/manifest.txt`. Add `.migration-stash/` to `.gitignore`.
- [ ] **Step 2:** `git merge origin/main --no-ff --no-commit` (expect conflicts).
- [ ] **Step 3:** Take main's deletions (old contract + effect system + effect tests): `git rm` the modify/delete set (`widget/src/effects-host.ts`, effect stories, `widget/test/{effect-dispatch,extension-ui,extension}.*`). `git checkout origin/main -- packages/extensions/src packages/extensions/tsdown.config.ts`.
- [ ] **Step 4:** Resolve `core`/`grab`/`widget`/`plugin` content conflicts to **main's** structure (drop our sync/db/effect wiring). Resolve `pnpm-lock.yaml` by `pnpm install` after package.jsons settle.
- [ ] **Step 5:** `git rm -r packages/core/src/sync packages/core/src/db` (re-home in Phase 3 from the stash).
- [ ] **Step 6:** Do NOT commit yet — Task 0.2 must land in the same merge commit (the tree won't typecheck until services.ts is gone).

### Task 0.2: Delete `plugin/services.ts`; adopt main's boot

**Why:** `services.ts` (`bootServices`) imports `@conciv/core/{db,sync}`, `@conciv/extensions`, `@conciv/whiteboard` and boots the trailbase supervisor — it is NOT a merge conflict (main never had it) so it breaks the build silently. Main replaced it with `makeEngineBooter` + `loadServerExtensions` (no supervisor, no sync).

**Files:** Delete `packages/plugin/src/core/services.ts`; take main's `packages/plugin/src/core/{boot.ts,vite.ts,extensions.ts}`; remove any remaining `services`/`dbProxyTarget`/`syncHooks`/`bootServices` references (`grep -rn "bootServices\|dbProxyTarget\|syncHooks\|core/sync\|core/db" packages --include=*.ts`).

- [ ] **Step 1:** `git rm packages/plugin/src/core/services.ts`; `git checkout origin/main -- packages/plugin/src/core/{boot.ts,vite.ts,extensions.ts}`.
- [ ] **Step 2:** Grep for every remaining consumer of core sync/db across ALL packages (not just whiteboard): fix or remove. Confirmed consumers beyond whiteboard: `services.ts` (deleted). Verify none remain.
- [ ] **Step 3:** Exclude whiteboard and run `pnpm install` then `pnpm turbo run typecheck --filter='!@conciv/whiteboard'` — iterate until PASS.
- [ ] **Step 4:** Commit the merge (`PATH=… git commit --no-edit`, append Co-Authored-By).

**Checkpoint:** report conflict + non-conflict resolutions before Phase 1.

---

## Phase 1 — Harness session header (re-apply) + contract additions (G1, G2)

### Task 1.0: Re-apply the lost MCP session header (BOTH transports)

**Why:** our `conciv-session-id` header fix is gone on main (`args.ts`/`sdk.ts` send `{type:'http',url}` with no `headers`; `HarnessTurn` has no `sessionId`). Without it `mcp.ts` resolves `sessionId=''` → G1 room-routing breaks AND G2 `injectApproval` finds no channel → fails closed. This gates 1.1, 1.2, and every live check.

**Files:** `packages/protocol/src/harness-types.ts` (`HarnessTurn.sessionId?`), `packages/harness/src/_shared/text-adapter.ts` (set it from `deps.sessionId`), `packages/harness/src/claude/args.ts` (`mcpServerConfig(mcpUrl, sessionId)` → `headers:{[CONCIV_SESSION_HEADER]: sessionId}`), `packages/harness/src/claude/sdk.ts` (same on `options.mcpServers`). Test: `packages/harness/test/claude-mcp-session.test.ts`.

- [ ] **Step 1:** Failing test — `mcpServerConfig(url,'conciv_x').conciv.headers['conciv-session-id'] === 'conciv_x'`; `buildClaudeArgs({...,sessionId})` `--mcp-config` JSON carries the header; header-less when no session.
- [ ] **Step 2:** Run, verify FAIL.
- [ ] **Step 3:** Implement (shared `mcpServerConfig` helper used by both args.ts + sdk.ts; thread `HarnessTurn.sessionId` from the text adapter).
- [ ] **Step 4:** Run PASS; commit.

### Task 1.1: Thread `{sessionId, previewId}` into extension tool execute (G1)

**Wiring (corrected):** `request` only exists per-MCP-request. Thread it from `mcp.ts`, not the build-time `app.ts` map.

**Files:** `packages/extension/src/types.ts` (`ExtensionServerTool.execute: (input, request) => Promise<unknown>`), `packages/extension/src/define-tool.ts` (`__execute`/`ToolBuilder.server` execute → `(input, ctx, request)`), `packages/core/src/app.ts` (the per-tool wrapper becomes `execute: (input, request) => run(input, context, request)`), `packages/core/src/api/mcp/mcp.ts` (`buildServer` takes `request`; route reads `sessionIdFromHeaders` + `previewId`; `tool.execute(args, request)`), `packages/core/src/config.ts`/`engine.ts` (pass `cfg.previewId` into `registerMcpRoutes` — chat routes get it today, MCP does not). Test: `packages/core/test/extension-tool-session.it.test.ts`.

- [ ] **Step 1:** Failing test — boot core with a one-tool extension whose execute echoes `request.sessionId`; MCP `tools/call` with header `conciv-session-id: conciv_x`; assert echo `conciv_x` and `request.previewId === 'local'`.
- [ ] **Step 2:** Run, verify FAIL.
- [ ] **Step 3:** Implement the thread: `registerMcpRoutes(app, makeCtx, extensionTools, previewId)`; in the route, `const request = {sessionId: sessionIdFromHeaders(headers) ?? '', previewId}`; `buildServer(ctx, extensionTools, request)`; `tool.execute(args, request)`; widen the signatures through `app.ts` + `define-tool`.
- [ ] **Step 4:** Run PASS; commit.

### Task 1.2: Self-declared approval via the existing native gate (G2)

**Files:** `packages/extension/src/{define-tool,types}.ts` (`approval?: 'ask'` on the tool), `packages/core/src/api/chat/permission.ts` (`decide`: `allow` unless `(toolName==='Bash' && classifyCommand!=='allow') || risky.has(toolName)`), `packages/core/src/app.ts` (collect `mcp__conciv__${tool.name}` for `approval:'ask'` tools → pass the prefixed set into `makePermissionGate`), `packages/harness/src/claude/sdk.ts` (drop `allowedTools:['mcp__conciv']`), `packages/harness/src/claude/args.ts` (drop `--allowedTools mcp__conciv`; `PreToolUse` matchers = `['Bash', 'mcp__conciv__.*']`, update the "runs unprompted" comment). Tests: gate unit + `packages/harness/test/claude-mcp-session.test.ts` (matcher) + full-stack `extension-approval.it.test.ts`.

- [ ] **Step 1:** Failing gate unit test — `makePermissionGate(uiBus, {risky:new Set(['mcp__conciv__canvas.delete'])})`: `decide('mcp__conciv__canvas.delete',…)` injects; `decide('canvas.delete',…)` (unprefixed) does NOT (locks the prefixed-name form); safe tool returns `allow` without inject.
- [ ] **Step 2:** Run FAIL → implement → PASS.
- [ ] **Step 3:** Harness matcher test — `PreToolUse` matchers include a regex that matches `mcp__conciv__canvas.delete`; `buildOptions` no longer sets `allowedTools`. Implement → PASS; commit.
- [ ] **Step 4:** Full-stack approval IT (the live residual) — real engine + a `approval:'ask'` extension tool; SDK-path turn; assert the native approval card renders on the MCP tool part (decode `cb.id` == `canUseTool` `toolUseID`) and a `/permission-decision` unblocks it. Scope note: verified on the SDK transport (default); CLI-hook path covered by the matcher fix.

**Checkpoint:** report after Phase 1.

---

## Phase 2 — Scaffold the new extension package + register it + rewrite test helpers

### Task 2.1: Create `packages/extensions/whiteboard` (`@conciv/extension-whiteboard`)

**Files:** new `packages/extensions/whiteboard/package.json` mirroring `test-runner` (name `@conciv/extension-whiteboard`; exports `.`→server view, `./client`→client view; deps incl. yjs/y-_/trailbase/@tanstack/_/excalidraw moved from core+whiteboard); `src/server.ts` (server `defineExtension(...).server(...)`), `src/client.ts` (`defineExtension(...).client(...)` + the `Register` augmentation). Move `packages/whiteboard/src/**` into `packages/extensions/whiteboard/src/**` (`git mv`).

- [ ] **Step 1:** `git mv packages/whiteboard packages/extensions/whiteboard`; rename the package; split `index.ts` into `server.ts` + `client.ts` (mirror test-runner). Tools split into `tool/{def,server,client}` so the node (`.`) bundle stays Solid-free.
- [ ] **Step 2:** `pnpm install`; `pnpm turbo run typecheck --filter @conciv/extension-whiteboard` will FAIL (imports still reference deleted APIs) — that's expected; this task only establishes the package shell + exports. Commit the move.

### Task 2.2: Register whiteboard as a built-in

**Files:** `packages/plugin/src/core/extensions.ts` (add `import whiteboard from '@conciv/extension-whiteboard'` to `builtinExtensions`; add `'@conciv/extension-whiteboard/client'` to `BUILTIN_CLIENT_ENTRIES`; add the client import to `extensionsModuleSource()`), `packages/plugin/package.json` + `packages/widget/package.json` (add the dep, mirror test-runner). Test: `packages/plugin/test/widget-inject.it.test.ts` (assert the emitted module imports the whiteboard client).

- [ ] **Step 1:** Failing test — the virtual extensions module source includes the whiteboard client entry.
- [ ] **Step 2:** Implement; PASS; commit.

### Task 2.3: Rewrite the shared whiteboard test helpers (prerequisite for all ITs)

**Why:** `helpers/boot-stack.ts` imports `@conciv/core/{db,sync}` + `collectServerContributions`; `helpers/run-tool.ts` POSTs `/api/tools/run` (deleted). All 13 whiteboard ITs depend on these.

**Files:** `packages/extensions/whiteboard/test/helpers/{boot-stack.ts,run-tool.ts,page.ts}`.

- [ ] **Step 1:** Rewrite `boot-stack` to boot via core `start()` with whiteboard as a built-in extension (its `.server()` now owns sync/db); expose the engine base + the extension sub-app base.
- [ ] **Step 2:** Rewrite `run-tool` to invoke a tool via MCP JSON-RPC `tools/call` carrying `conciv-session-id` (the agent path), AND a `postAction(path, body)` helper for the G3 client routes.
- [ ] **Step 3:** Update `page.ts` relay to the new sync route path.
- [ ] **Step 4:** Commit (no standalone test; proven by the ITs that consume them in Phases 3–5).

**Checkpoint:** report after Phase 2.

---

## Phase 3 — Re-home sync + db onto the extension's `server.app`

### Task 3.1: Move + fix the sync engine (room from path, per-route handler)

**Why (review BLOCKER):** our `sync.ts` hardcodes `SYNC_PREFIX='/api/sync/'` to parse the room and exposes a single global hooks object for the srvx `ws()` plugin. On the sub-app the path is `/api/ext/whiteboard/sync/<room>` and main resolves hooks via `Response.crossws`.

**Files:** `packages/extensions/whiteboard/src/server/sync/{sync.ts,snapshot-store.ts,index.ts}` (from stash). Test: `packages/extensions/whiteboard/test/sync.it.test.ts` (engine-level, moved) + new `sync-route.it.test.ts`.

- [ ] **Step 1:** Move sync source; replace prefix-based `roomOf(url)` with a per-room handler factory `roomHandler(room)` returning `defineWebSocketHandler(hooksFor(room))` (h3 → `Response.crossws`).
- [ ] **Step 2:** Failing `sync-route.it.test.ts` — two `y-websocket` clients to `/api/ext/whiteboard/sync/room-a` against a booted engine converge.
- [ ] **Step 3:** Implement the route in the `.server()` factory: `server.app.get('/sync/:room', (event) => roomHandler(event.context.params.room))`; **exempt this route from the sub-app origin-guard** (or ensure the upgrade Origin is allowed) so `attachWebSocket`'s resolve-fetch isn't 403'd into a silent no-op. Confirm `attachWebSocket` is installed at server boot on main.
- [ ] **Step 4:** Run both PASS; commit.

### Task 3.2: Move db + supervise trailbase in `.server()`; fix the proxy path

**Why (review):** the trailbase child needs starting/stopping; `registerDbProxy` reads the un-stripped `event.req.url`, so under `withBase` it forwards `/api/ext/whiteboard/api/records/...` → 404.

**Files:** `packages/extensions/whiteboard/src/server/db/{live-db,proxy,trail-config,trail-supervisor,index}.ts` (ALL five, from stash). Tests: move ALL of `db-proxy.it`, `live-db.it`, `trail-config.it`, `trail-supervisor.it` (the v1 dropped three — restore them).

- [ ] **Step 1:** Move db source + all four tests; retarget imports.
- [ ] **Step 2:** Fix `proxy.ts` to derive the upstream path from the `withBase`-stripped `event.url.pathname`, not `event.req.url`.
- [ ] **Step 3:** Run the moved db tests PASS; commit.
- [ ] **Step 4:** The supervisor lifecycle lands in Task 4.4 (`.server()` start + `dispose`).

**Checkpoint:** report after Phase 3 (platform foundation — riskiest).

---

## Phase 4 — Port the server half (tools + client-action routes + assembly)

### Task 4.1: Port `canvas.*` tools (DI context + G1 session routing + approval)

**Files:** rewrite `src/tool/canvas/{def,server,client}.ts` (from `tools/canvas.ts`); keep `room.ts`. Test: rewrite `test/canvas-tools.it.test.ts` to the MCP path (session header → room) + `canvas.delete` triggers the gate (not a 403).

- [ ] **Step 1:** Failing test — `canvas.draw` via MCP with `conciv-session-id: conciv_x` writes pending into `local:conciv_x`; a client on that room receives it; `canvas.delete` is gated.
- [ ] **Step 2:** FAIL → implement (`roomOf(context.sync, request) = sync.room(roomId(request.previewId, request.sessionId))`; `canvas.delete`/`clear` declare `approval:'ask'`; keep the pending-queue draw model) → PASS; commit.

### Task 4.2: Port `comment.*` tools + extract pure action functions (for G3)

**Files:** rewrite `src/tool/comment/{def,server,client}.ts`; `src/comments-store.ts`/`schema.ts` (collection comes from `context.db`, not a module singleton — both server AND client must stop using the singleton, see Task 5.3). Extract the create/reply/resolve/delete/move logic into `context` functions called by BOTH the MCP tool execute AND the client-action routes (Task 4.3). Tests: rewrite `comment-dualwrite.it`, `comment-thread.it`, `comments-collection.it`, `pin-move.it`.

- [ ] **Step 1:** Failing dual-write test (row + Yjs pin into the session room).
- [ ] **Step 2:** FAIL → implement (pure functions in context; `comment.delete`/`resolve` declare `approval:'ask'`) → PASS; commit.

### Task 4.3: Expose client-action HTTP routes (G3)

**Why (review BLOCKER):** the new `ClientApi` has no `runTool`. Pins/thread/comment-action need a client path. Tools run only via MCP today.

**Files:** in `.server()`, register `server.app.post('/comment', …)`, `/comment/reply`, `/comment/resolve`, `/pin/move`, `/pin/state` calling the SAME pure functions as the tools. Test: `test/client-actions.it.test.ts` — POST `/api/ext/whiteboard/comment` creates a comment (no agent).

- [ ] **Step 1:** Failing test (POST creates a comment row + pin).
- [ ] **Step 2:** FAIL → implement (share pure fns; no duplicated logic) → PASS; commit.

### Task 4.4: Port `anchor.*`/`element.*` + assemble `.server()`

**Files:** `src/tool/{anchor,element}/*` (use `context.cwd`; `confine.ts`/`oxc-capture.ts`/`git-track.ts`/`resolver.ts`/`load-resolver.ts` are pure — move unchanged). `src/server.ts`: `defineExtension({name:'whiteboard', tools:[...], systemPrompt}).server((server) => { start trail supervisor; build sync+db; mount /sync, db-proxy, and client-action routes; return {context:{sync,db,comments,cwd:server.cwd}, dispose: ()=>supervisor.stop()} })`. Tests: move `anchor`/`resolver`/`git-track`/`element-reference`/`confine`/`oxc-capture`/`room`/`schema`/`harness`/`mermaid` tests; retarget. `loads.it` retargeted.

- [ ] **Step 1:** Wire `.server()`; `RequiredContext<Tools>` forces the context to satisfy every tool.
- [ ] **Step 2:** `pnpm turbo run typecheck --filter @conciv/extension-whiteboard` PASS.
- [ ] **Step 3:** Run the moved server-side ITs (anchor/resolver/git-track/element/confine/oxc/room/schema/harness/mermaid/canvas-tools/comment\*/sync-route/db/loads) PASS; commit.

**Checkpoint:** report after Phase 4.

---

## Phase 5 — Port the client half

### Task 5.1: Overlay — light-DOM `<Portal>` + persistent island (createRoot/{value,dispose})

**Files:** `src/client/overlay.tsx` (`CanvasOverlay`: `<Portal mount={document.body}>` hosts the Excalidraw `<div ref>` at z `2147482000`; `mountIsland` into it — the one React boundary; bind sync→handle in `createEffect` on `roomId('local', api.client.sessionId() ?? '')`, **skip binding while session is null**; `<PinsLayer>`/`<Thread>` rendered into `surface()`). Keep `canvas/{island.tsx,island-types,glue,canvas-sync,ai-draws,presence}`, `pins/{pins,thread,drag-prompt}` (export `PinsLayer`/`Thread`). Delete `canvas/canvas-effect.ts`. Tests: restore from `892f3a9` → `canvas-overlay.it`, `canvas-persist.it`, `canvas-ai-draw.it` onto `startWidgetServer` (+ whiteboard routes).

- [ ] **Step 1:** Restore the three ITs from `git show 892f3a9:packages/widget/test/<file>`; retarget onto `helpers/widget-server.ts` (`startWidgetServer`, NOT `serveWidgetAsset`) and the new open path.
- [ ] **Step 2:** Failing — open canvas, draw, ink>blank; close hides (host attached, canvas hidden); reopen instant (immediate ink). Keep the [[excalidraw-initialdata-clobbers-seed]] rAF seed + keep-mounted behaviors.
- [ ] **Step 3:** FAIL → implement; the `.client()` factory wraps in `createRoot((dispose)=>({value:{toggle}, dispose:()=>{handle.destroy(); dispose()}}))` (mirror highlight); `previewId` from a meta tag (as `mount.tsx` reads apiBase) → PASS; commit.

### Task 5.2: Composer toggle (Component + slot + clientValue) + session follow

**Files:** `src/client.ts` adds `Component` (renders the "Open the whiteboard canvas" button when `useSlot()==='composer'`, reading `useContext((c)=>c.toggle)`); `.client()` returns `{value:{toggle}, dispose}`; `declare module '@conciv/extension'` augments `Register` so `useContext` is typed. Rewrite `pins/comment-action.tsx` from `ExtComposerAction`+`runTool` → a Component + `postAction` (G3). Tests: restore + retarget `comment-action.it`, `pins.it`, `pin-drag.it`.

- [ ] **Step 1:** Failing — composer shows the button; click mounts the canvas; comment-action POSTs `/api/ext/whiteboard/comment`.
- [ ] **Step 2:** FAIL → implement → PASS; commit.

### Task 5.3: Client db collection from routes; drop the singleton

**Files:** `.client()` builds the TanStack collection against `/api/ext/whiteboard/api/records/v1/*`; pass it as a prop into `PinsLayer`/`Thread` (`MountPinsOpts.collection`/`MountThreadOpts.collection`); delete the client `getCommentsCollection()` singleton usage so session re-bind re-points the query. Test: restore + retarget `comments-collection.it`.

- [ ] **Step 1:** Failing — pins render from the route-backed collection; switching session re-points it.
- [ ] **Step 2:** FAIL → implement → PASS; commit.

**Checkpoint:** report after Phase 5.

---

## Phase 6 — Re-validate + live smoke

### Task 6.1: Audit main's rewritten `tool-ui`/`protocol`/`grab` against the ported cards

**Why (review):** non-conflict main rewrites (20 `tool-ui` files: `streamTitle`/card contract; `protocol/tool-view-types`; `grab`) affect whiteboard tool cards + comment-action.

- [ ] **Step 1:** Diff `git show origin/main:packages/tool-ui/src/*` + `protocol/tool-view-types` against what the whiteboard `tool/client.ts` cards consume; fix the render cards (`renderCall`/`renderResult` → main's `__render`/`streamTitle` shape).
- [ ] **Step 2:** Typecheck + the tool-card ITs PASS; commit.

### Task 6.2: Full suite + live

- [ ] **Step 1:** `pnpm turbo run build` (all) + `pnpm turbo run typecheck` (all) PASS.
- [ ] **Step 2:** `SKIP_STORYBOOK_TESTS=1 pnpm --filter @conciv/extension-whiteboard exec vitest run` — all PASS.
- [ ] **Step 3:** Widget ITs PASS: `canvas-overlay canvas-persist canvas-ai-draw comment-action pins pin-drag comments-collection extension-approval` + the restored client `sync-awareness`/`session-switch`/`client-sync`/`client-db` (port or, for the removed `runTool`/probe paths `client-api-runtool`/`probe-extension`, DELETE with a note).
- [ ] **Step 4:** Rebuild server packages + restart dev (kill by LISTEN pid); open canvas via the composer button; agent draws → rectangle paints (G1 routing + re-applied header); agent `canvas.clear` → native approval card on the tool (G2) → decision resolves.
- [ ] **Step 5:** Update memories ([[agent-mcp-needs-session-header]] still required; new memory "whiteboard owns sync/db on its sub-app"); update both plan STATUS sections.

---

## Coverage checklist (orphans flagged by review — every file has a task)

- **Tools:** canvas (4.1), comment + pin.setState + comment.move/pin-move (4.2), anchor + element.reference (4.4). Mermaid: `mermaid.it` moved (4.4). Presence: `presence.it` moved (4.4). canvas-sync/glue/island internals: kept (5.1), their ITs moved (4.4/5.1).
- **Server tests moved/retargeted (4.4):** anchor, resolver, git-track, element-reference, confine, oxc-capture, room, schema, harness, mermaid, canvas-tools, comment-dualwrite, comment-thread, comments-collection, pin-move, sync(+route), db-proxy, live-db, trail-config, trail-supervisor, loads.
- **Client tests (5.x):** canvas-overlay(new), canvas-persist, canvas-ai-draw, comment-action, pins, pin-drag, comments-collection, extension-approval(1.2); plus widget client ITs — port `sync-awareness`/`session-switch`/`client-sync`/`client-db`; DELETE `client-api-runtool`/`probe-extension` (old runTool/probe path removed by G3) with a note; `approval-resume` re-target to the native gate.
- **Src orphans:** `anchor/load-resolver.ts` (pure, moved 4.4), `css-inline.d.ts` (ambient `?inline` types — keep for the Portal CSS inject in 5.1).
