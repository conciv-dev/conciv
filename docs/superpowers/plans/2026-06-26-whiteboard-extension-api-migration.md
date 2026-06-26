# Whiteboard → New Extension API Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implement task-by-task, TDD, checkpoint between phases. Work **inline** (no dispatched subagents — house rule [[work-inline-not-subagents]]). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Re-home the `@mandarax/whiteboard` extension (canvas, comments, pins, anchoring) onto main's rewritten extension architecture, where an extension owns its own H3 routes, tools carry an injected context, overlays render through `ClientApi.surface()`, and there is no effect/sync/db platform in core.

**Architecture:** Main deleted `@mandarax/extensions` (the effect-based contract) for `@mandarax/extension`: `defineExtension({name, configSchema, tools, systemPrompt, Component}).client(factory).server(factory)`. `.server()` receives `{config, cwd, app: H3}` (a sub-app mounted at `/api/ext/<name>/*`) and returns a DI `context` its tools receive; `.client()` runs at widget mount and renders overlays into `surface()`. Main never had `sync` (Yjs) or `db` (TanStack/trailbase) — those were our Phase-0 additions to core. We move that machinery **into the whiteboard extension**, hosted on its own `server.app`, and add three small, agreed capabilities to `@mandarax/extension`.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (island, light DOM via `<Portal>`), Yjs + `y-websocket` + `y-indexeddb` (extension-owned WS on `server.app` via crossws), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection` (extension-owned routes), `oxc-parser` + shell `git` (anchoring), h3, zod.

## Grounding (read before starting)

- Reference extensions on main: `packages/widget/src/extensions/highlight.tsx` (client overlay pattern via `surface()`), `packages/extensions/test-runner/src/server.ts` (server `app` routes + DI context + tool wiring), `packages/extension/src/{define-extension,define-tool,types,extension-api}.ts` (the contract).
- Main core wiring: `packages/core/src/app.ts` (`__server` factories run here; `makeExtensionApp` mounts `/api/ext/<name>`; extension tools → MCP), `packages/core/src/extension-app.ts`, `packages/core/src/api/mcp/mcp.ts` (MCP dispatch — `tool.execute(args)` today, **no session**), `packages/core/src/api/chat/permission.ts` (the native approval gate), `packages/core/src/api/ws.ts` (`attachWebSocket` resolves `{crossws}` from any route).
- Our code being re-homed: `packages/core/src/sync/*`, `packages/core/src/db/*` (move into the whiteboard package), `packages/whiteboard/**` (port).
- Memory: [[agent-mcp-needs-session-header]], [[excalidraw-needs-light-dom]], [[excalidraw-initialdata-clobbers-seed]], [[native-approval-hybrid]], [[no-tool-registry-self-describe]], [[no-stubs-or-mocks]], [[test-assertions-native]], [[no-abbreviated-names]], [[work-inline-not-subagents]], [[use-turbo-build]], [[kill-server-listen-only]].

## Global Constraints (every task)

- **Code style (hard):** functions not classes (lone exception: `island.tsx`'s React error boundary); NO IIFE; ZERO narration comments (short ones only where they earn it); no `any`; no casts except a localized assertion at a third-party branded-type boundary; no `else`; functional (map/reduce); **spell names out fully — no abbreviations** ([[no-abbreviated-names]]).
- **Deps:** all present & approved (`yjs`, `y-indexeddb`, `y-websocket`, `@tanstack/*`, `trailbase`, `oxc-parser`, `zod`, `solid-js`, `react`, `react-dom`, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`). **Install gate:** none planned; STOP and ask before adding any dependency.
- **Testing:** real `trail` (`bootStack`/`createLiveDb`) + real Chromium (`chromium.launch()` → `browser.newPage()`, NEVER `newContext()`); no mocks/jsdom/stubs ([[no-stubs-or-mocks]]). Native assertions; **vitest `expect` has no `toBeVisible`/`toBeAttached` — use Playwright `locator.waitFor({state})`**; `getByRole` does not pierce the effects shadow — use css/text/`[aria-label]`. Run with `SKIP_STORYBOOK_TESTS=1`. Fresh `getPort()` per suite.
- **Build/typecheck:** via turborepo from the worktree root (`pnpm turbo run build|typecheck --filter …`) ([[use-turbo-build]]). Widget ITs load the built widget dist (bundles whiteboard) — rebuild whiteboard + widget before a widget IT after editing whiteboard src.
- **Commits:** TDD per step. `oxfmt` reformats on first commit of a file — `git add -A` and re-run the SAME commit. End every message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Workflow:** run every command from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/canvas-comments`; never `cd` to the main repo ([[worktree-stay-in-worktree]]). Kill dev servers by LISTEN pid only ([[kill-server-listen-only]]).
- **Decided design (locked):** G1 thread the MCP request `{sessionId, previewId}` into extension tool execute; G2 reuse the native gate (no new approval map/route — generalize one line + stop blanket-allowing risky MCP tools + tools self-declare `approval`); G3 the client talks to the extension's own `/api/ext/whiteboard/*` routes (no generic `runTool`); overlay uses a self-hosted light-DOM `<Portal>` for Excalidraw and `surface()` (shadow) for pins/thread.

---

## STATUS

Not started. Pre-migration HEAD is `892f3a9` (keep-canvas-mounted fix). Migration target base is `origin/main` (63 commits ahead; deleted `@mandarax/extensions`, rewrote the contract, no effects/sync/db). A trial `git merge origin/main --no-commit` produced 26 conflicts (core/extensions/plugin/widget); aborted. `packages/whiteboard` does not conflict but will be broken post-merge (imports the deleted package + core sync/db).

---

## Phase 0 — Merge main, land on the new platform (broken whiteboard is expected)

**Outcome:** the branch builds everything EXCEPT whiteboard on top of main's architecture; our core `sync`/`db` source is preserved (moved, not deleted) for re-home in Phase 2; the old `@mandarax/extensions` contract + effect system + `/api/tools/run` are gone.

### Task 0.1: Merge main, resolve platform conflicts toward main's model

**Files (conflict set, 26):** `packages/core/src/{app,engine,widget-tags}.ts`, `packages/core/package.json`, `packages/extensions/src/{contract,discovery,index}.ts` (+ `tsdown.config.ts`), `packages/grab/src/grab.ts`, `packages/plugin/src/core/{boot,extensions,vite,widget-middleware}.ts` (+ test), `packages/widget/src/{mount.tsx,effects-host.ts,...}`, widget effect stories + `test/effect-*.test.ts` + `extension*.it.test.ts`, `packages/widget/{vite.config.ts,package.json}`, `pnpm-lock.yaml`.

**Interfaces produced:** a building monorepo on main's extension contract; `@mandarax/extension` available; `@mandarax/extensions` (legacy contract) gone.

- [ ] **Step 1: Preserve sync/db source before the merge can delete/clobber it.** Copy our re-home inputs out of the conflict zone so resolution can't lose them:

```bash
mkdir -p .migration-stash
cp -r packages/core/src/sync .migration-stash/sync
cp -r packages/core/src/db .migration-stash/db
git ls-files packages/core/src/sync packages/core/src/db > .migration-stash/sync-db-manifest.txt
```

- [ ] **Step 2: Start the merge.**

```bash
git merge origin/main --no-ff --no-commit
```

Expected: `Automatic merge failed; fix conflicts`.

- [ ] **Step 3: Resolve "modify/delete" conflicts by taking main's deletion.** The old effect/extensions contract and effect tests are superseded — delete our versions:

```bash
git rm packages/widget/src/effects-host.ts packages/widget/src/effects/highlight.stories.tsx \
  packages/widget/src/page-effects.stories.tsx packages/widget/test/effect-dispatch.test.ts \
  packages/widget/test/extension-ui.it.test.ts packages/widget/test/extension.it.test.ts
```

- [ ] **Step 4: Resolve `packages/extensions/src/*` — take main.** Main keeps `packages/extensions/` only as the home for individual extensions (e.g. `test-runner`); the legacy `contract.ts`/`discovery.ts`/`index.ts` (our effect+sync+db contract) are deleted on main. Accept main:

```bash
git checkout origin/main -- packages/extensions/src packages/extensions/tsdown.config.ts
```

- [ ] **Step 5: Resolve `core`/`plugin`/`grab`/`widget` content conflicts — take main's structure, drop our sync/db/effect wiring.** For each remaining conflicted file, keep main's version and re-apply only changes that still make sense (e.g. our harness MCP-session-header fix in `packages/harness` is NOT in this conflict set — confirm it survived; if main rewrote `args.ts`/`sdk.ts`, re-apply the `mandarax-session-id` header per [[agent-mcp-needs-session-header]]). Resolve `pnpm-lock.yaml` by regenerating after package.json resolution: `pnpm install`.
- [ ] **Step 6: Delete core sync/db from the tree (they re-home to the extension in Phase 2).** They are now unreferenced by core (main's core has no sync/db):

```bash
git rm -r packages/core/src/sync packages/core/src/db
```

Keep `.migration-stash/` (gitignored) as the Phase-2 source.

- [ ] **Step 7: Add `.migration-stash/` to `.gitignore`.**
- [ ] **Step 8: Make everything-but-whiteboard typecheck.** Temporarily exclude whiteboard from the workspace build (it is knowingly broken until Phase 2-4):

```bash
pnpm turbo run typecheck --filter='!@mandarax/whiteboard' 2>&1 | tail -20
```

Expected: PASS (resolve any remaining fallout from the merge).

- [ ] **Step 9: Commit the merge.**

```bash
git add -A && git commit --no-edit
```

(Merge commit message; append the Co-Authored-By line.)

**Checkpoint:** stop and report the conflict-resolution decisions before Phase 1.

---

## Phase 1 — Extension API additions (G1 session, G2 approval)

**Outcome:** `@mandarax/extension` + core support (a) per-request session in extension tool execute, and (b) approval via the existing native gate driven by self-declaring tools. No new approval map/route.

### Task 1.1: Thread `{sessionId, previewId}` into extension tool execute (G1)

**Files:**

- Modify: `packages/extension/src/define-tool.ts` (the `Ctx` already exists; add a request arg), `packages/extension/src/types.ts` (`ExtensionServerTool.execute` signature).
- Modify: `packages/core/src/app.ts:85-99` (wrap `tool.__execute` to pass request), `packages/core/src/api/mcp/mcp.ts` (pass `{sessionId, previewId}` from the request into execute).
- Test: `packages/core/test/extension-tool-session.it.test.ts` (new).

**Interfaces produced:** extension tool `execute(input, context, request)` where `request: {sessionId: string; previewId: string}`.

- [ ] **Step 1: Failing test.** Boot core with a one-tool extension whose `execute` echoes `request.sessionId`; POST `/api/mcp` with header `mandarax-session-id: mandarax_x`; assert the tool saw `mandarax_x`.

```ts
// real engine via start(); MCP JSON-RPC tools/call with the session header; expect echoed sessionId
expect(result.sessionId).toBe('mandarax_x')
```

- [ ] **Step 2: Run, verify FAIL** (`execute` gets no request today). `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/core exec vitest run extension-tool-session`.
- [ ] **Step 3: Implement.** In `mcp.ts`, read `sessionIdFromHeaders` + previewId (config) once per request; in `app.ts`, change the tool wrapper to `(input) => tool.__execute(input, context, request)`; widen `ExtensionServerTool.execute` and `ToolBuilder.server`'s execute to `(input, ctx, request)`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** (`feat(extension): thread request session into extension tool execute`).

### Task 1.2: Generalize the native gate + tool self-declared approval (G2)

**Files:**

- Modify: `packages/extension/src/define-tool.ts` (+ `types.ts`): add optional `approval?: 'ask'` to the tool definition, surfaced on `ExtensionTool`.
- Modify: `packages/core/src/api/chat/permission.ts` (`decide`: replace `if (toolName !== 'Bash') return 'allow'` with a risky-set check), `packages/core/src/app.ts` (collect `mcp__mandarax__<name>` for tools declaring `approval: 'ask'`; pass the set into `makePermissionGate`).
- Modify: `packages/harness/src/claude/sdk.ts` (drop blanket `allowedTools: ['mcp__mandarax']`; rely on `canUseTool`), `packages/harness/src/claude/args.ts` (broaden the `PreToolUse` matcher past `'Bash'` so MCP tools reach `/api/chat/permission`).
- Delete: the legacy `approval`/`approvalPolicies`/`/api/tools/run` path if any survived the merge (should be gone with main).
- Test: `packages/widget/test/extension-approval.it.test.ts` (new) — agent (or a direct `canUseTool` simulation) calling a `approval:'ask'` tool surfaces a native approval card on the tool part.

**Interfaces produced:** `defineTool({..., approval: 'ask'})`; gate gates any tool whose MCP name is in the risky set; native card unchanged.

- [ ] **Step 1: Failing unit test for the gate.** `makePermissionGate(uiBus, {risky: new Set(['mcp__mandarax__canvas.delete'])})`; `decide('mcp__mandarax__canvas.delete', {}, sid, id)` injects an approval (assert `uiBus.injectApproval` called) and a safe tool returns `allow` without injecting.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement the gate change.** `decide` returns `allow` unless `toolName === 'Bash' && classifyCommand(...)!=='allow'` OR `risky.has(toolName)`; thread the risky set from `app.ts` (collected from extension tools' `approval`).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Harness change + its unit test.** Assert `buildOptions` no longer sets `allowedTools: ['mcp__mandarax']` (so `canUseTool` fires) and `claudeMcpArgs`/hook settings register a matcher covering `mcp__mandarax__*`. (Extends the existing `claude-mcp-session.test.ts` style.)
- [ ] **Step 6: Run, verify PASS; commit** (`feat(extension): self-declared tool approval via the existing native gate`).
- [ ] **Step 7: Full-stack approval IT (the residual live check from validation).** Real engine + a `approval:'ask'` extension tool; drive a `canUseTool`-path turn; assert the approval card renders on the MCP tool part and a decision unblocks it. Confirms `injectApproval` targets MCP `toolCallId` (decode `cb.id` == `toolUseID`).

**Checkpoint:** stop and report after Phase 1.

---

## Phase 2 — Re-home sync + db as whiteboard-owned `server.app` routes

**Outcome:** the whiteboard package contains the sync engine + db, hosted on its own sub-app; the client connects to `/api/ext/whiteboard/*`.

### Task 2.1: Move the sync engine into the whiteboard package

**Files:**

- Create: `packages/whiteboard/src/server/sync/{sync.ts,snapshot-store.ts,index.ts}` (from `.migration-stash/sync/*`, namespaces/imports updated; no behavioral change).
- Create: `packages/whiteboard/src/server/db/{live-db.ts,proxy.ts,trail-config.ts,trail-supervisor.ts,index.ts}` (from `.migration-stash/db/*`).
- Modify: `packages/whiteboard/package.json` (move the deps that were in core: `yjs`, `y-protocols`, `crossws` adapter usage, `trailbase`, `@tanstack/*` as needed).
- Test: move/keep `packages/core/test/sync/sync.it.test.ts` + `db/db-proxy.it.test.ts` → `packages/whiteboard/test/sync.it.test.ts` + `db-proxy.it.test.ts`, retargeted to the new import paths.

**Interfaces produced:** `createSync({store})`, `createSnapshotStore(db)`, `createLiveDb({...})`, `createTrailSupervisor({...})` — same signatures, new home.

- [ ] **Step 1: Copy files from stash, fix imports.**
- [ ] **Step 2: Move the sync + db-proxy ITs; retarget imports.**
- [ ] **Step 3: Run them, verify PASS** (`SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard exec vitest run sync db-proxy`). These are behavior-preserving moves; tests are the safety net.
- [ ] **Step 4: Commit** (`refactor(whiteboard): re-home sync + db engine from core into the extension`).

### Task 2.2: Host sync (Yjs WS) on the whiteboard `server.app`

**Files:**

- Create: `packages/whiteboard/src/server/index.ts` — the `.server()` factory body: build `sync`/`db`, register routes on `server.app`, return `{context, dispose}`.
- Modify: `packages/whiteboard/src/index.ts` (wire `.server()` — see Phase 3 for the merged whole).
- Test: `packages/whiteboard/test/sync-route.it.test.ts` — connect a `y-websocket` client to `/api/ext/whiteboard/sync/<room>` against a booted engine; two clients converge.

**Interfaces produced:** WS endpoint `GET /api/ext/whiteboard/sync/:room` returning `{crossws: hooks}`; `context.sync` (the engine), `context.db`.

- [ ] **Step 1: Failing test** — y-websocket client to `wsBase + /api/ext/whiteboard/sync/room-a`; set a key; second client observes it.
- [ ] **Step 2: Run, verify FAIL** (route not mounted).
- [ ] **Step 3: Implement** — in the `.server()` factory, `server.app.get('/sync/:room', (event) => syncUpgrade(event))` returning the crossws hooks our `sync.ts` already produces (the platform's `attachWebSocket` resolves `{crossws}`). Mount the db/trailbase proxy routes the client needs.
- [ ] **Step 4: Run, verify PASS; commit** (`feat(whiteboard): host the Yjs sync socket on the extension sub-app`).

**Checkpoint:** stop and report after Phase 2 (the platform foundation is the riskiest part).

---

## Phase 3 — Port server tools to the new contract

**Outcome:** `canvas.*`, `comment.*`, `anchor.*`, `element.*` are `defineTool().server(execute).render?(card)` builders, listed on the extension meta, executing with the DI `context` (sync/db/cwd) + per-request `{sessionId, previewId}` (G1) for room routing; destructive ones declare `approval: 'ask'` (G2).

### Task 3.1: Port `canvas.*` tools

**Files:**

- Rewrite: `packages/whiteboard/src/tools/canvas.ts` → `defineTool` builders (`canvas.read/draw/diagram/connect/update/delete/clear/export`).
- Modify: `packages/whiteboard/src/room.ts` (room id unchanged: `roomId(previewId, sessionId)`).
- Test: rewrite `packages/whiteboard/test/canvas-tools.it.test.ts` to the new MCP path (drive via MCP with a session header; assert scene; `canvas.delete` triggers the approval gate, not a 403).

**Interfaces produced:** `canvasTools: ToolBuilder[]`; each `execute(input, context, request)` uses `roomOf(context.sync, request)`.

- [ ] **Step 1: Failing test** — `canvas.draw` via MCP with `mandarax-session-id: mandarax_x` writes into `local:mandarax_x` pending; a client on that room receives it; `canvas.delete` is gated (approval injected), not auto-run.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — `roomOf = (sync, request) => sync.room(roomId(request.previewId, request.sessionId))`; `canvas.delete`/`canvas.clear` declare `approval: 'ask'`. Keep the pending-queue draw model ([[excalidraw-needs-light-dom]] lesson #4 — server writes skeletons, browser converts).
- [ ] **Step 4: Run, verify PASS; commit.**

### Task 3.2: Port `comment.*` tools

**Files:**

- Rewrite: `packages/whiteboard/src/tools/comment.ts` (`comment.create/delete/list/read/reply/resolve/move`, `pin.setState`).
- Modify: `packages/whiteboard/src/comments-store.ts`, `packages/whiteboard/src/schema.ts` (the db collection now comes from `context.db`, not a module singleton — pass it through).
- Test: rewrite `packages/whiteboard/test/comment-dualwrite.it.test.ts` + `comment-thread.it.test.ts` + `comments-collection.it.test.ts` to the new context/session path.

**Interfaces produced:** `commentTools: ToolBuilder[]`; the comments collection created in `.server()` and injected via `context.comments`. `comment.delete`/`comment.resolve` declare `approval: 'ask'`.

- [ ] **Step 1: Failing test** (dual-write row + Yjs pin into the session room).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** (route the collection + room from context/request; drop the `setCommentsCollection` module singleton — provide via context).
- [ ] **Step 4: Run, verify PASS; commit.**

### Task 3.3: Port `anchor.*` + `element.*` tools

**Files:**

- Modify: `packages/whiteboard/src/tools/anchor.ts`, `packages/whiteboard/src/tools/element.ts` (use `context.cwd` instead of the old `mx.cwd`; `confine.ts`/`oxc-capture.ts`/`git-track.ts`/`resolver.ts` are pure and unchanged).
- Test: keep `packages/whiteboard/test/{anchor,resolver,git-track,element-reference,confine,oxc-capture}.*test.ts`, retargeted.

- [ ] **Step 1: Retarget tests to the new builder + context.**
- [ ] **Step 2: Run, verify FAIL where the shape changed.**
- [ ] **Step 3: Port to `defineTool().server((input, context) => …context.cwd…)`.**
- [ ] **Step 4: Run, verify PASS; commit.**

### Task 3.4: Assemble the extension server half + prompt

**Files:**

- Rewrite: `packages/whiteboard/src/index.ts` → `defineExtension({name:'whiteboard', configSchema?, tools:[...canvas, ...comment, ...anchor, ...element], systemPrompt}).server((server) => { build sync/db; mount routes; return {context:{sync, db, comments, cwd: server.cwd}} })`.
- Test: `packages/whiteboard/test/loads.it.test.ts` retargeted (extension boots, tools registered, sub-app mounted).

- [ ] **Step 1: Wire it; the `RequiredContext<Tools>` type forces the server `context` to satisfy every tool's `__ctx`.**
- [ ] **Step 2: `pnpm turbo run typecheck --filter @mandarax/whiteboard` — verify PASS.**
- [ ] **Step 3: Run `loads` IT, verify PASS; commit.**

**Checkpoint:** stop and report after Phase 3.

---

## Phase 4 — Port the client (overlay, composer button, sync/db client)

**Outcome:** the whiteboard `.client()` factory renders the canvas overlay (light-DOM Excalidraw via `<Portal>` + shadow pins/thread via `surface()`), adds the composer "open canvas" button, builds the db collection + sync client against `/api/ext/whiteboard/*`, and follows the active session.

### Task 4.1: Client overlay — full Solid, Excalidraw via `<Portal>`, persistent island

**Files:**

- Create: `packages/whiteboard/src/client/overlay.tsx` — `CanvasOverlay` Solid component: `<Portal mount={document.body}>` hosts the Excalidraw `<div ref>` (light DOM), `mountIsland` into it (the one React boundary), bind sync→handle in a `createEffect` on the active room; `<PinsLayer>`/`<Thread>` rendered into `surface()` (shadow). Visibility kept-mounted (the [[excalidraw-initialdata-clobbers-seed]] rAF seed + keep-mounted behavior carry over).
- Keep: `packages/whiteboard/src/canvas/{island.tsx,island-types.ts,glue.ts,canvas-sync.ts,ai-draws.ts,presence.ts}` (island internals unchanged), `packages/whiteboard/src/pins/{pins.tsx,thread.tsx,drag-prompt.tsx}` (export `PinsLayer`/`Thread` as components).
- Delete: `packages/whiteboard/src/canvas/canvas-effect.ts` (the effect primitive is gone).
- Test: rewrite `packages/widget/test/canvas-effect.it.test.ts` → `canvas-overlay.it.test.ts`; keep `canvas-persist.it.test.ts` + `canvas-ai-draw.it.test.ts` (retarget the open path to the new composer button / client toggle).

**Interfaces produced:** `mountWhiteboardOverlay(api: ClientApi, session: () => string)` returning `{show, hide, dispose}`.

- [ ] **Step 1: Failing test** — open canvas via the client toggle, draw, assert ink; close hides (host attached, canvas hidden); reopen instant (immediate ink). (Same assertions as today, new mount path.)
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the Solid overlay; client gets the active session id from `ClientApi.client` (SessionClient) and `previewId` from config/meta; sync client connects to `/api/ext/whiteboard/sync/<room>`.
- [ ] **Step 4: Run, verify PASS; commit.**

### Task 4.2: Composer "open canvas" button + client db collection + session follow

**Files:**

- Modify: `packages/whiteboard/src/index.ts` — add `Component` (renders into the `'composer'` slot via `useSlot()` to provide the toggle) and `.client(() => { build db collection against /api/ext/whiteboard; mount overlay; return {value, dispose} })`.
- Modify: `packages/whiteboard/src/pins/comment-action.tsx` (composer comment action → call the extension's own route, not `runTool` — G3).
- Test: rewrite `packages/widget/test/comment-action.it.test.ts`, `pins.it.test.ts`, `pin-drag.it.test.ts`, `comments-collection.it.test.ts` to the new client wiring.

- [ ] **Step 1: Failing test** — composer shows "Open the whiteboard canvas"; clicking it mounts the canvas; pins render from the db collection.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — client db collection via the extension routes; pin-drag / comment actions POST to `/api/ext/whiteboard/*`; session-follow re-binds the room on `client` session change.
- [ ] **Step 4: Run, verify PASS; commit.**

**Checkpoint:** stop and report after Phase 4.

---

## Phase 5 — Re-validate the full suite + live smoke

**Outcome:** every whiteboard behavior proven green on the new architecture; the agent draws into the open canvas live.

### Task 5.1: Green the full whiteboard + widget IT suite

- [ ] **Step 1:** `pnpm turbo run build --filter @mandarax/whiteboard --filter @mandarax/widget`.
- [ ] **Step 2:** `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard exec vitest run` — all PASS.
- [ ] **Step 3:** `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/widget exec vitest run canvas-overlay canvas-persist canvas-ai-draw comment-action pins pin-drag comments-collection extension-approval` — all PASS.
- [ ] **Step 4:** `pnpm turbo run typecheck` (whole workspace) — PASS.
- [ ] **Step 5: Commit** any test fixups.

### Task 5.2: Live end-to-end smoke (real agent draws)

- [ ] **Step 1:** rebuild server-side packages + restart dev (`apps/examples/tanstack-start`), kill by LISTEN pid only.
- [ ] **Step 2:** open canvas via the composer button; ask the agent to draw; confirm the rectangle paints (the [[agent-mcp-needs-session-header]] routing must still hold through G1).
- [ ] **Step 3:** ask the agent to `canvas.clear`; confirm the **native approval card** appears on the tool (G2) and a decision resolves it.
- [ ] **Step 4: Update memories** ([[agent-mcp-needs-session-header]] → header still required; new memory for "whiteboard owns sync/db on its sub-app"); update the original whiteboard plan STATUS.

---

## Self-Review

- **Spec coverage:** G1 (Task 1.1), G2 (Task 1.2), sync/db re-home (2.1–2.2), tools incl. approval-gating + session routing (3.1–3.4), overlay/light-DOM/persistence (4.1), composer + client routes + session-follow (4.2), validation incl. the residual approval-card-on-MCP check (1.2 Step 7, 5.2). Mermaid AI-draw path preserved (3.1 Step 3). Anchoring confinement/secret-denylist preserved (3.3, pure files unchanged).
- **Open discoveries (resolve in-task, not placeholders):** exact main wiring of `app.ts` extension collection + how the widget collects package extensions vs built-ins; whether `SessionClient` exposes the active session id (Task 4.1 Step 3 — confirm; if not, that is a fourth small API gap to raise before coding 4.1); the trailbase client wiring against extension routes (Task 2.1/4.2 — mirror our current `createLiveDb`).
- **Type consistency:** `roomId(previewId, sessionId)` used identically server (3.1) and client (4.1); `execute(input, context, request)` defined in 1.1 and consumed in 3.x; `approval: 'ask'` defined in 1.2 and used in 3.1/3.2.
