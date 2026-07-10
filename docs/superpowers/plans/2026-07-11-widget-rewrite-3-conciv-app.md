# Widget Rewrite Plan 3: the conciv app — router app, page plane, embed bundle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the deleted widget as `apps/conciv` (TanStack Solid Router app) + `packages/page` (DOM half of the page plane) + `packages/embed` (the published bundle), and make the plugin serve the real app instead of the stub — as a **behavior-preserving port**: the old widget's UX is the spec; only the architecture changes.

**Architecture:** Routes replace every hand-built layout state machine (`__root` chrome, `/` closed, `/panel/$sessionId/$view`, `/quick?panes=&focus=`, `/pip/$sessionId`); the embedded router runs on `@conciv/storage-history` (localStorage-persisted, already built), standalone runs on browser history — injected at the entry. Data = `@conciv/client` hooks (`chatConnection`/`useChatSession` on the one attach stream) + TanStack Query options for the plain endpoints, with TanStack DB `queryCollectionOptions` collections where list reactivity is wanted. There are NO live list streams (contract v4): refetch after own mutations, on attach lifecycle chunks, and on window focus.

**Tech Stack:** `@tanstack/solid-router` + `@tanstack/history` (pin together), `@tanstack/solid-query`, `@tanstack/solid-db` + `@tanstack/query-db-collection` (client collections), `@conciv/client` / `@conciv/contract` / `@conciv/storage-history`, ui-kit-system/chat/chat-tools/terminal + mascot, UnoCSS wind4 (shadow-DOM rules), Playwright/Chromium for all UI tests.

**Behavior reference (HARD, user-locked 2026-07-11: "behavior is already good, the code is the horrible part"):** the deleted widget at git ref `6cef8769~1` — read source with `git show 6cef8769~1:packages/widget/src/<path>`. Every task lists the old files it ports; deviations from observable old behavior are review defects. Composer while a run is active: **send disabled + Stop shown, typing stays enabled** (old behavior, re-confirmed by user).

## Global Constraints

- Behavior-preserving port. No UX redesigns, no new features, no removed affordances. When old code had a behavior quirk, keep it unless it was a bug with a test proving so.
- Client = UI components ONLY (spec v3.3 rule): render rows/parts, forward intents, physical device concerns. A non-focus/scroll/animation `createEffect` is a review defect. No module-level state; no `register*` APIs.
- Functions not classes; ZERO comments; no `any`/`as`/non-null `!`; no IIFEs; cyclomatic ≤ 4. oxfmt/oxlint clean.
- Solid rules from memory (all HARD): no `useContext()` passed inline as prop (capture at render); no sendMessage/signal writes in render body; `createRoot(fn, owner)` + dispose for handler-created panels; views over context with compound sub-components, never prop-drill; TooltipIconButton or system Button/Tooltip for every icon button; Ark primitives over hand-rolled; Ark + shadow DOM = `EnvironmentProvider(shadowRoot)` (popovers at 0,0 otherwise); Ark FocusTrap via ui-kit-system (asChild drops ref → wrapper div); `useListCollection` not reactive — update via `set()`; Zag tabs indicator slides via `--transition-*` vars; collapsible animation via `@keyframes` on `data-state`.
- Styling: UnoCSS wind4 with `unx-` prefix; hoist `@property` to document.head; no arbitrary `[prop:value]` pileups; presetMini gaps (`animate-*`, `aria-*`, `sr-only`) need the repo preset.
- Tests: REAL browser (Playwright/Chromium) — never jsdom/happy-dom; `browser.newPage()` never `newContext()`; wait for `domcontentloaded` or UI signals, NEVER `networkidle` (attach SSE never idles); assertions via roles/text/visibility, never classes/computed styles/test-ids. NO doubles/shims: app tests boot a REAL served core app via `@conciv/harness-testkit` (`createFakeHarness` for scripted runs; the spec's stale "implement(contract) mocks" line is superseded by the plan-2 lock — testkit provides everything except the BootApp leaf).
- Every Solid package's vitest config pins `test: {environment: 'node'}` (vite-plugin-solid injects jsdom otherwise and the run exits 1).
- Embed bundle externalizes EVERY `@conciv/extension/*` subpath + shared Ark/Solid deps — port the mount-externals guard test; a second bundled copy splits context and popovers render at 0,0.
- The oRPC contract does NOT change in this plan. Core does NOT change in this plan (any needed core fix is a STOP-and-ask).
- Commit per task with pathspec. `pnpm exec fallow audit --changed-since main --format json` zero INTRODUCED at the end. Known non-gating red: claude-image + codex live ITs.
- New published package (`@conciv/embed`, `@conciv/page` if published): add to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts` + `.fallowrc.json` `publicPackages` + homepage/repository fields. `apps/conciv` stays private, never published, and gets NO tests under `apps/` (repo rule) — its behavior is tested from `packages/embed` ITs + ui-kit unit tests; route-logic tests live in the app package itself as real-browser ITs driven through the served embed bundle (see Task 9) or, where pure (search-param zod parsers), as node unit tests inside `apps/conciv/test`.

## Verified facts (2026-07-11)

- `@conciv/storage-history` EXISTS (plan 2): Web-Storage-persisted `@tanstack/history` (`createHistory`, entries+index, storage injectable, corrupted-storage fallback unit-tested). Consume, don't create.
- `@conciv/client` EXISTS (plan 2): `chat-connection.ts` (attach subscribe with reconnect loop + snapshot heal; send), `use-chat-session.ts` (explicit-args `useChatSession({rpc, sessionId})`), `query-utils.ts` (`makeQueryUtils(rpc)` → `queryOptions`/`mutationOptions` per contract procedure; `.live` variants deleted in contract v4). First send gates on `connectionStatus === 'connected'` (snapshot-wipe race, plan-2 lock — the composer must honor this).
- Wire protocol (plan 2.7-as-executed): `attach` = `MESSAGES_SNAPSHOT`s + `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR` (`runId = sessionId:epoch`); final snapshot precedes `RUN_FINISHED`; approval rides tool-call parts (`part.approval.id`, `state: 'approval-requested'`); `conciv_ui` is a blocking tool-call part answered via `chat.uiReply({sessionId, toolCallId, value})` (UNKNOWN_REQUEST when not pending); stop = `sessions.stop` then `RUN_FINISHED {finishReason:'stop'}`; usage lands on the sessions row at run end (refetch sessions on RUN_FINISHED to show it).
- ui-kit-chat renders approval via `part.approval.id` keying (permission card) — unchanged by 2.7; ui-kit-chat-tools has the tool cards; mascot has `FabRobot`; ui-kit-system has drag/resize/PiP-host/announcer/FocusTrap primitives; ui-kit-terminal has the xterm component.
- Old-widget inventory at `6cef8769~1:packages/widget/src/` — the port map below names every file. `src/page/*` (page-driver, handlers, react-bridge, react-grab/*, overlay, mirror, snapshot, dehydrate, context-tracker, render-tracker, effect-toast, grab-api, client-api, page-bus) is the DOM-execution half → `packages/page`. `src/shell/*` + `src/chat/*` + `src/composer/*` + `src/extension/*` + `src/lib/*` → `apps/conciv` routes/components (state-machine files `modal-panes.ts`/`quick-panes.ts`/`pane-content.ts`/`persisted-signal.ts`/`draggable-position.ts` are REPLACED by routes + custom history + ui-kit-system primitives, not ported).
- Intent skills to load before the respective tasks: `@tanstack/solid-db#solid-db` (Task 2), `@tanstack/db#db-core` sub-skills as needed. Run the skill check from workspace root.
- `npx @tanstack/cli create --router-only --framework solid` is the locked scaffold command (spec); commit the RAW scaffold before adapting so generated-vs-ours is visible in history.

## Locked interfaces

```ts
// apps/conciv src/router.ts — the library export embed consumes
export function createConcivRouter(config: ConcivRouterConfig): Router
export type ConcivRouterConfig = {
  rpc: RpcClient                       // makeRpcClient(base) — injected, never created inside routes
  history: RouterHistory               // storage-history (embed) or browser history (standalone)
  environment: {rootNode: Node; document: Document}   // shadow root vs document
  settings: ConcivSettings             // parsed widget settings (hotkeys, quickTerminal.enabled, theme)
}

// apps/conciv src/data/collections.ts — the client data layer (Task 2)
export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData
export type AppData = {
  sessions: Collection<SessionMeta>    // queryCollectionOptions over rpc.sessions.list; refetch on attach lifecycle + own mutations + focus
  utils: ReturnType<typeof makeQueryUtils>
  invalidateOnRunEnd: (sessionId: string) => void   // wired by each pane's attach consumer
}

// packages/page src/index.ts — DOM half, consumed by embed entry (not by apps/conciv routes)
export function startPagePlane(opts: {rpc: RpcClient; document: Document}): {dispose: () => void}
// subscribes rpc.page.queries, executes verbs via the ported page-driver, replies via rpc.page.reply

// packages/embed src/index.ts — the ~10-line entry
// createStorageHistory → createConcivRouter → mount into shadow root → startPagePlane
```

Behavior contracts carried verbatim from the old widget (each is a test target):

- Esc closes the top layer (`history.back()`); Esc inside an xterm goes to the terminal first (`terminal-focus`).
- Leave-guards (`useBlocker`) while a run is streaming or a view is locked.
- Quick terminal: `?panes=<sessionId[]>&focus=<index>` zod-validated; hotkey from settings; disabled ⇒ no hotkey + `beforeLoad` redirect `/quick → /`; add pane = create + append; close pane = remove (+ last one → `/`); focus captured on open, restored to the previously-focused host element on close.
- Draft reconciliation: composer text is local while focused; drafts row is a debounced `drafts.set`; server row only replaces local text when the composer is NOT focused.
- Composer during a run: send disabled + Stop; typing enabled; first send additionally gated on `connectionStatus === 'connected'`.
- Fab renders instantly (no data dependency); every async surface has skeleton + error boundary with retry (production-grade bar).
- PiP: style cloning into the PiP document + `EnvironmentProvider(pipDocument)`.

---

### Task 1: scaffold `apps/conciv` + wire the injected entries

**Files:** Create `apps/conciv` (scaffold), then adapt: `src/router.ts` (`createConcivRouter`), `src/entry-standalone.tsx` (browser history + document, vite dev server `index.html`), route skeletons `src/routes/{__root,index,panel,panel.$sessionId,panel.$sessionId.$view,quick,pip.$sessionId}.tsx` with placeholder outlets; `vitest.config.ts` pinning `environment: 'node'`; package.json private, deps.

- [ ] Step 1: `npx @tanstack/cli create --router-only --framework solid` into `apps/conciv`; commit the RAW scaffold (`chore(app): tanstack scaffold, unmodified`).
- [ ] Step 2: adapt — router factory takes `ConcivRouterConfig` (history/environment/rpc/settings injected; router context carries them); route tree per the spec table; standalone entry boots against a running core dev server URL.
- [ ] Step 3: unit-test the pure parts in `apps/conciv/test` (node): quick search-param zod parser round-trip; router builds with storage-history and restores the last route after a simulated reload (entries+index through a fake Storage).
- [ ] Step 4: typecheck + commit.

### Task 2: the data layer — collections + query wiring

Load `@tanstack/solid-db#solid-db` + `@tanstack/db#db-core` first. **Files:** `apps/conciv/src/data/collections.ts`, `src/data/settings.ts` (port `client/widget-settings.ts`).

- `sessions` collection via `queryCollectionOptions` (TanStack Query fetch of `rpc.sessions.list`); invalidation: after every own session mutation (create/rename/remove/setModel/compact/stop), on `RUN_STARTED`/`RUN_FINISHED` observed by any mounted pane, on window focus. No polling loops.
- Drafts/markers/models/commands/tools stay plain `queryOptions` from `makeQueryUtils` (no collection ceremony where a query suffices).
- [ ] Port + node-test the settings parser; commit.

### Task 3: `__root` chrome — providers, fab, HUD, announcer

**Port map:** `shell/fab-robot.tsx` (wiring only — visuals are mascot's), `shell/approval-modal.tsx` → approval HUD fed by tool-call parts with `approval` + `chat.permissionDecision` mutation, `shell/dialogs.tsx`, `shell/empty-state.tsx`, `shell/suppression.ts`, `lib/theme.ts`, live-region announcer (ui-kit-system primitive). Providers: `EnvironmentProvider(config.environment.rootNode)` → theme → QueryClient → app context (rpc/settings/data).

- [ ] Port; Esc/`history.back()` at root; leave-guard registration; commit.

### Task 4: `/panel/$sessionId` — the chat pane

**Port map:** `chat/chat-panel.tsx` (assembly onto ui-kit-chat primitives), `chat/tool-fallback-card.tsx` + `chat/gen-ui.tsx` → conciv_ui blocking card rendered from the tool-call part by name + `chat.uiReply` mutation (2.5 model — no custom events), `chat/trigger-menus.tsx` (/ + @ menus), `composer/*` (model-selector, session-selector, compact-action, new-session-action, open-in-terminal-action), panel geometry from `shell/widget-shell.tsx` + `lib/draggable-position.ts`/`lib/resize.ts` → ui-kit-system drag/resize primitives on the `/panel` layout route.
- Each pane's `useChatSession` lives in the route component; session switch = mount/unmount, never connection surgery. Usage/model chip reads the sessions collection row; refetch on run end shows post-run usage.
- [ ] Port; composer contract (disabled send + Stop, draft debounce + focus reconciliation); commit.

### Task 5: `/panel/$sessionId/$view` — extension views

**Port map:** `extension/extension-slots.tsx`, `extension/extension-views.ts`, `extensions/highlight.tsx`. Views are the `$view` param; tab switching = route navigation with the Zag-tabs indicator var rule; extension clients keep contributing via the manifest contract (no `register*`).
- [ ] Port; view leave-lock behavior (`useBlocker`); commit.

### Task 6: `/quick` — quick terminal layer

**Port map:** `shell/quick-terminal.tsx`, `shell/terminal-focus.ts` (quick-panes.ts/pane-content.ts logic dissolves into the route + search params). Behavior contract as locked above, xterm from ui-kit-terminal.
- [ ] Port; commit.

### Task 7: `/pip/$sessionId`

**Port map:** `shell/pip.tsx` — PiP host primitive from ui-kit-system, style cloning, `EnvironmentProvider(pipDocument)`.
- [ ] Port; commit.

### Task 8: `packages/page` — the DOM half of the page plane

**Port map:** ALL of `src/page/*` (page-driver, page-handlers, page-bus client side → `rpc.page.queries` iterator + `rpc.page.reply`, react-bridge pre-hydration global as its private versioned concern, react-grab/*, overlay, mirror, snapshot, dehydrate, context-tracker, render-tracker, effect-toast, grab-api, client-api) into `packages/page` with `startPagePlane(opts)`. No behavior change — this is the `conciv_page` tool's client executor coming back to life exactly as it was.
- [ ] Port; unit-test the pure parsers (node); the executed-verb round-trip is covered by the embed IT (Task 9) driving `/api/page/:verb` against the mounted page plane; commit.

### Task 9: `packages/embed` — the published artifact + the real-browser ITs

**Files:** `src/index.ts` (~10 lines: storage-history → `createConcivRouter` → shadow-root mount → `startPagePlane`), vite bundle config (inline the private app; externalize every `@conciv/extension/*` subpath + shared Ark/Solid deps), the mount-externals guard test (port from the old widget build tests), `conciv-global.ts` + `shadow.ts` + `mount.tsx` ports.
**ITs (the old widget IT suite re-homed):** real browser against the PREBUILT bundle (`pnpm turbo run build --filter=@conciv/embed` first), real served core app via harness-testkit + `createFakeHarness`, `browser.newPage()`, `domcontentloaded`. Coverage = the behavior contracts list (Esc layering, quick panes round-trip, leave guards, composer contract, approval card round-trip, conciv_ui card round-trip via scripted tool call, draft reconciliation, reload restores route via storage-history, PiP opens).
- [ ] Bundle + guard test green; IT suite green; add `@conciv/embed` to `PUBLIC_PACKAGES` + `.fallowrc.json`; commit.

### Task 10: plugin serves the real app

**Files:** `packages/plugin/src/core/*` + `widget-middleware` — replace the stub notice with serving the embed bundle (dev: vite-served; prod path stays `apply: 'serve'`-only per the dev-only rule); re-pin the stub tests to the real serving behavior.
- [ ] Manual smoke on an example app (widget = REBUILD dist then hard-reload; core edits = restart); commit.

### Task 11: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (environmental reds excepted); fallow zero INTRODUCED.
- [ ] Behavior parity sweep: walk the behavior-contracts list against the running example app manually; any mismatch with the old widget is a defect to fix before closing.
- [ ] Memory update (plan 3 executed + findings).
