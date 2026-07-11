# Widget Rewrite Plan 3: the conciv app — router app, page plane, embed bundle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the deleted widget as `apps/conciv` (TanStack Solid Router app) + `packages/page` (DOM half of the page plane) + `packages/embed` (the published bundle), and make the plugin serve the real app instead of the stub — as a **behavior-preserving port**: the old widget's UX is the spec; only the architecture changes.

**Architecture:** Routes replace every hand-built layout state machine (`__root` chrome, `/` closed, `/panel/$sessionId/$view`, `/quick?panes=&focus=`, `/pip/$sessionId`); the embedded router runs on `@conciv/storage-history` (localStorage-persisted, already built), standalone runs on browser history — injected at the entry. Data = `@conciv/client` hooks (`chatConnection`/`useChatSession` on the one attach stream) + plain TanStack Query options for everything else (review-locked: NO TanStack DB collection ceremony unless a concrete cross-collection reactive join appears — a plain `useQuery` + `invalidateQueries` covers the sessions list). There are NO live list streams (contract v4): refetch after own mutations, on attach lifecycle chunks, and on window focus. **The app's URL lives in OUR DB (user-locked 2026-07-11, remodeled from 'layout' to navigation):** the embedded router IS the app's URL; its history (entries + index) persists to a `navigation` row via rpc write-behind, not localStorage (Task 0) — session-restore semantics, like a browser.

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
- Contract v4.1: the ONLY contract/core/db change this plan makes is Task 0's `navigation` row + `navigation.get`/`navigation.set` verbs, TYPED as `NavigationStateSchema` (protocol): `{entries: [{href, state?}], index}` — the app's URL stack WITH per-entry history state (full TanStack Router parity: `navigate({state})`, stable location keys for scroll restoration — browsers persist `history.state` across reloads and so do we). Core never interprets it beyond storage. Anything else touching contract/core is a STOP-and-ask.
- Commit per task with pathspec. `pnpm exec fallow audit --changed-since main --format json` zero INTRODUCED at the end. Known non-gating red: claude-image + codex live ITs.
- Publish decisions (locked): `@conciv/embed` is the ONLY new published package — add to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts` + `.fallowrc.json` `publicPackages` + homepage/repository fields, and REMOVE the stale `@conciv/widget`/`@conciv/api-client` entries still in `.fallowrc.json`. `@conciv/page` is PRIVATE (embed inlines it exactly like the app). `apps/conciv` stays private, never published, the repo rule forbids tests under `apps/examples/*` ONLY — `apps/conciv/test` node unit tests (pure parsers, settings) are fine; behavioral coverage lives in `packages/embed`'s real-browser ITs against the prebuilt global bundle.

## Verified facts (2026-07-11)

- `@conciv/storage-history` EXISTS (plan 2): Web-Storage-persisted `@tanstack/history` (`createHistory`, entries+index, storage injectable, corrupted-storage fallback unit-tested). Consume, don't create.
- `@conciv/client` EXISTS (plan 2): `chat-connection.ts` (attach subscribe with reconnect loop + snapshot heal; send), `use-chat-session.ts` (explicit-args `useChatSession({rpc, sessionId})`), `query-utils.ts` (`makeQueryUtils(rpc)` → `queryOptions`/`mutationOptions` per contract procedure; `.live` variants deleted in contract v4). First send gates on `connectionStatus === 'connected'` (snapshot-wipe race, plan-2 lock — the composer must honor this).
- Wire protocol (plan 2.7-as-executed): `attach` = `MESSAGES_SNAPSHOT`s + `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR` (`runId = sessionId:epoch`); final snapshot precedes `RUN_FINISHED`; approval rides tool-call parts (`part.approval.id`, `state: 'approval-requested'`); `conciv_ui` is a blocking tool-call part answered via `chat.uiReply({sessionId, toolCallId, value})` (UNKNOWN_REQUEST when not pending); stop = `sessions.stop` then `RUN_FINISHED {finishReason:'stop'}`; usage lands on the sessions row at run end (refetch sessions on RUN_FINISHED to show it).
- ui-kit-chat renders approval via `part.state === 'approval-requested'` + `part.approval.id` (verified thread.tsx:127 / permission.tsx:24 — matches the 2.7 server exactly); decision wiring is `ctx.respondApproval(id, approved)` → map to `chat.permissionDecision`. There is NO conciv_ui renderer in ui-kit-chat — the blocking card is built in-app, and it MUST parse tool input from `part.arguments` (JSON string), never `part.input` (always empty — memory-pinned). ui-kit-chat-tools has the tool cards; mascot exports `createFabRobotRig` (not `FabRobot` — old fab-robot.tsx wires it); ui-kit-system has drag/resize/PiP-host/announcer/FocusTrap primitives; ui-kit-terminal has the xterm component.
- Review-verified (2 Opus agents, 2026-07-11): `npx @tanstack/cli create --router-only --framework solid` is real (cli 0.69.5); solid-router 1.170.17 supports injected `history` + typed router `context` and exports `useBlocker`; solid-router pins `@tanstack/history@1.162.0` EXACTLY and storage-history's `^1.162.0` matches — verify a SINGLE history instance resolves in the final bundle (dual copies break navigation like dual-Solid breaks context); solid-db 0.2.28 / query-db-collection 1.0.47 / db 0.6.14 / solid-query 5.101.2 are version-coherent; `useChat` exposes `connectionStatus` accessor; core CORS allows any LOOPBACK origin (standalone dev must be localhost/127.0.0.1 or be added to `allowedOrigins`); 50ms snapshot cadence = 20 full-array reconciles/s — fine at chat scale, no change.
- `useChatSession.onCustomEvent` is now vestigial (conciv_ui rides tool parts since 2.5/2.7) — delete it from `@conciv/client` in Task 4 if nothing consumes it (grep first).
- Old page transport was api-client SSE with `requestId` INSIDE the query; contract v4 yields `{requestId, query: unknown}` (sibling) — `startPagePlane` glue must `PageQuerySchema.parse(query)` and rewrap replies as `{requestId, data}` (Task 8). The driver/handlers/PageResult port unchanged.
- Old-widget inventory at `6cef8769~1:packages/widget/src/` — the port map below names every file. `src/page/*` (page-driver, handlers, react-bridge, react-grab/_, overlay, mirror, snapshot, dehydrate, context-tracker, render-tracker, effect-toast, grab-api, client-api, page-bus) is the DOM-execution half → `packages/page`. `src/shell/_`+`src/chat/_`+`src/composer/_`+`src/extension/_`+`src/lib/_`→`apps/conciv`routes/components (state-machine files`modal-panes.ts`/`quick-panes.ts`/`pane-content.ts`/`persisted-signal.ts`/`draggable-position.ts` are REPLACED by routes + custom history + ui-kit-system primitives, not ported).
- Intent skills to load before the respective tasks: `@tanstack/solid-db#solid-db` (Task 2), `@tanstack/db#db-core` sub-skills as needed. Run the skill check from workspace root.
- `npx @tanstack/cli create --router-only --framework solid` is the locked scaffold command (spec); commit the RAW scaffold before adapting so generated-vs-ours is visible in history.

## Locked interfaces

```ts
// apps/conciv src/router.ts — the library export embed consumes
export function createConcivRouter(config: ConcivRouterConfig): Router
export type ConcivRouterConfig = {
  rpc: RpcClient // makeRpcClient(base) — injected, never created inside routes
  history: RouterHistory // storage-history (embed) or browser history (standalone)
  environment: {rootNode: Node; document: Document} // shadow root vs document
  settings: ConcivSettings // parsed widget settings (hotkeys, quickTerminal.enabled, theme)
}

// apps/conciv src/data/app-data.ts — the client data layer (Task 2; review-locked: plain query, no collections)
export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData
export type AppData = {
  utils: ReturnType<typeof makeQueryUtils> // queryOptions/mutationOptions per procedure
  invalidateSessions: () => void // called after own mutations, on RUN_STARTED/FINISHED, on focus
}

// Task 0 — the app's URL in OUR db (user-locked; modeled as navigation, not "layout"): contract v4.1
// protocol: NavigationStateSchema = z.object({
//   entries: z.array(z.object({href: z.string(), state: z.unknown().optional()})),   // state = ParsedHistoryState (key + __TSR_index + user state) — JSON-safe by TSR contract
//   index: z.number(),
// })   — full router parity: browsers persist history.state per entry across reloads; so do we
// contract: navigation: {get: oc.output(NavigationStateSchema.nullable()), set: oc.input(NavigationStateSchema).output(Ok)}
// @conciv/db schema.ts: navigation table (id text pk default 'navigation', entries json string[], index integer, updatedAt) — plain CRUD row, rpc handlers inline drizzle
// embed: dbStorage adapter satisfying storage-history's injectable Storage — hydrated ONCE at boot (async entry), debounced write-behind
// of {entries, index}; multi-tab = last-write-wins (identical to the localStorage behavior it replaces). storage-history package UNCHANGED.

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

### Task 0: navigation row — contract v4.1 + db + rpc

**Files:** `packages/protocol/src/chat-types.ts` (+`NavigationStateSchema`), `packages/contract/src/contract.ts` (+`navigation` namespace), `packages/db/src/schema.ts` (+`navigation` table) + drizzle migration, `packages/core/src/rpc/router.ts` (two inline CRUD handlers), wire IT addition in `packages/core/test/rpc/wire.it.test.ts` (set → get round-trip).

- [ ] Contract + table + handlers + IT; `pnpm turbo run test --filter=@conciv/db --filter=@conciv/core` green; commit.

### Task 1: scaffold `apps/conciv` + wire the injected entries

**Also (user-locked full-router-parity):** amend `@conciv/storage-history` — `Persisted` widens from `{entries: string[], index}` to `{entries: [{href, state?}], index}`; persist the `states` array it already keeps in memory instead of minting fresh keys on rehydrate; `isPersisted` guard accepts the new shape (old/corrupt → `{entries: [{href: '/'}], index: 0}`); unit tests: `navigate({state})` payload + location keys survive a simulated reload.

**Files:** Create `apps/conciv` (scaffold), then adapt: `src/router.ts` (`createConcivRouter`), `src/entry-standalone.tsx` (browser history + document, vite dev server `index.html`), route skeletons `src/routes/{__root,index,panel,panel.$sessionId,panel.$sessionId.$view,quick,pip.$sessionId}.tsx` with placeholder outlets; `vitest.config.ts` pinning `environment: 'node'`; package.json private, deps.

- [ ] Step 1: `npx @tanstack/cli create --router-only --framework solid` into `apps/conciv`; commit the RAW scaffold (`chore(app): tanstack scaffold, unmodified`).
- [ ] Step 2: adapt — router factory takes `ConcivRouterConfig` (history/environment/rpc/settings injected; router context carries them); route tree per the spec table; standalone entry boots against a running core dev server URL (loopback origins only — core CORS allows localhost/127.0.0.1 without config).
- [ ] Step 3: unit-test the pure parts in `apps/conciv/test` (node): quick search-param zod parser round-trip; router builds with storage-history and restores the last route after a simulated reload (entries+index through a fake Storage).
- [ ] Step 4: typecheck + commit.

### Task 2: the data layer — collections + query wiring

**Files:** `apps/conciv/src/data/app-data.ts`, `src/data/settings.ts` (port `client/widget-settings.ts`).

- ALL reads are plain solid-query over `makeQueryUtils` (review-locked — TanStack DB collections deferred until a concrete cross-query reactive join exists). `invalidateSessions()` fires after every own session mutation (create/rename/remove/setModel/compact/stop), on `RUN_STARTED`/`RUN_FINISHED` observed by any mounted pane, and on window focus. No polling loops.
- [ ] Port + node-test the settings parser; commit.

### Task 3: `__root` chrome — providers, fab, HUD, announcer

**Port map:** `shell/fab-robot.tsx` (wiring only — visuals are mascot's), `shell/approval-modal.tsx` → approval HUD fed by tool-call parts with `approval` + `chat.permissionDecision` mutation, `shell/dialogs.tsx`, `shell/empty-state.tsx`, `shell/suppression.ts`, `lib/theme.ts`, live-region announcer (ui-kit-system primitive). Providers: `EnvironmentProvider(config.environment.rootNode)` → theme → QueryClient → app context (rpc/settings/data).

- [ ] Port; Esc/`history.back()` at root; leave-guard registration; commit.

### Task 4: `/panel/$sessionId` — the chat pane

**Port map:** `chat/chat-panel.tsx` (assembly onto ui-kit-chat primitives), `chat/tool-fallback-card.tsx` + `chat/gen-ui.tsx` → conciv_ui blocking card rendered from the tool-call part by name + `chat.uiReply` mutation (2.5 model — no custom events), `chat/trigger-menus.tsx` (/ + @ menus), `composer/*` (model-selector, session-selector, compact-action, new-session-action, open-in-terminal-action), panel geometry from `shell/widget-shell.tsx` + `lib/draggable-position.ts`/`lib/resize.ts` → ui-kit-system drag/resize primitives on the `/panel` layout route.

- Each pane's `useChatSession` lives in the route component; session switch = mount/unmount, never connection surgery. Usage/model chip reads the sessions collection row; refetch on run end shows post-run usage.
- conciv_ui card: parse input from `part.arguments` (never `part.input`); answered/timeout states per the 2.5 UNANSWERED shape; `chat.uiReply` mutation with UNKNOWN_REQUEST toast.
- Port `lib/ui-snapshot.ts` for PANE-LOCAL restoration only: scroll position, selection, dividers, focused flag (localStorage — genuinely per-tab device state). Its old draft/grabs fields are SUPERSEDED by the server drafts row; the old shell snapshot (layer/paneIds) is superseded by the router history. `shell/shell-contract.ts` types are replaced by the views-over-context compound components, not ported.
- [ ] Port; composer contract (disabled send + Stop, draft debounce + focus reconciliation); delete `useChatSession.onCustomEvent` if grep shows no consumer; commit.

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

**Port map:** ALL of `src/page/*` (page-driver, page-handlers, page-bus client side → `rpc.page.queries` iterator + `rpc.page.reply`, react-bridge pre-hydration global as its private versioned concern, react-grab/\*, overlay, mirror, snapshot, dehydrate, context-tracker, render-tracker, effect-toast, grab-api, client-api) into `packages/page` with `startPagePlane(opts)`. No behavior change — this is the `conciv_page` tool's client executor coming back to life exactly as it was.

- [ ] Port; unit-test the pure parsers (node); the executed-verb round-trip is covered by the embed IT (Task 9) driving `/api/page/:verb` against the mounted page plane; commit.

### Task 9: `packages/embed` — the published artifact + the real-browser ITs

**Files:** `src/index.ts` (storage-history over the Task-0 dbStorage adapter → `createConcivRouter` → shadow-root mount → `startPagePlane`), `src/styles.css` (port verbatim: uno reset + ui-kit-system tokens + ui-kit-chat theme css + solid-streamdown styles + the `--pw-*` OKLCH layer — `git show 6cef8769~1:packages/widget/src/styles.css`), `uno.config.ts` consuming `presetAidx()` from `@conciv/uno-preset` (the `unx-` prefix; scans app + ui-kit sources), `conciv-global.ts` + `shadow.ts` (`?inline` css import + `@property` hoist to document.head) + `mount.tsx` ports.
**TWO bundle outputs (review-CRITICAL — the old widget had two configs on purpose):**

1. `mount.js` — the embed target: externalizes every `@conciv/extension/*` subpath + shared Ark/Solid deps; guarded by the ported `mount-externals.test.ts`.
2. `conciv-widget.global.js` — self-contained IIFE (NO externals) — the artifact the browser ITs and AGENTS.md reference; an externalized bundle cannot boot in a bare page.
   **ITs (old suite disposition table — every old test accounted for):**
   | old widget test | disposition |
   |---|---|
   | widget.it, reload-continuity.it, mount-externals, widget-settings | ported (reload IT re-pinned: route via db-backed history; pane scroll/selection via ui-snapshot) |
   | trigger-menu.it | ported (Task 4 behavior, asserted here) |
   | panel-views.browser, extension.browser, extension-client.browser | ported (Task 5 behavior, asserted here) |
   | test-runner-card.browser | ported (card renders from tool part) |
   | react-verbs.it, effect-highlight.it, page-mirror, dehydrate | ported against packages/page via the mounted plane (Task 8 behavior) |
   | terminal-mode.it, foreground.browser, focus-suppression.browser | ported (quick layer + focus behavior) |
   | style-regression + computed-styles snapshots + shots/ | DROPPED — asserts computed styles, forbidden by test rules; visual sanity = manual parity walk (Task 11) |
   | storybook (.storybook/_, _.stories.tsx, storybook.css) | DROPPED — not part of the port; revisit post-plan-4 if wanted |
   Real browser against the PREBUILT global bundle (`pnpm turbo run build --filter=@conciv/embed` first), real served core app via harness-testkit + `createFakeHarness`, `browser.newPage()`, `domcontentloaded`.

- [ ] Both bundles + guard test green; IT suite green; publish-guard + fallowrc edits per Global Constraints; commit.

### Task 10: plugin serves the real app

**Files (review-corrected):** the stub is `packages/plugin/src/core/extensions.ts::extensionsModuleSource` (the `console.info('[conciv] widget UI removed…')` line) — restore the mount: import the embed entry, mount it. `widget-middleware.ts` is NOT the stub (it injects the meta tags + extensions script and stays as-is). ALSO `packages/plugin/src/nextjs-widget.ts` — the second, non-`core/` mount path (old: `import('@conciv/widget').then(({mountWidget}) => mountWidget([]))`) → point at the embed entry. Re-pin the stub tests to real serving.

- [ ] Manual smoke on BOTH example apps — `tanstack-start` (vite path) AND `nextjs-app` (nextjs-widget path); widget = REBUILD dist then hard-reload; core edits = restart; commit.

### Task 11: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (environmental reds excepted); fallow zero INTRODUCED.
- [ ] Behavior parity sweep: walk the behavior-contracts list against the running example app manually; any mismatch with the old widget is a defect to fix before closing.
- [ ] Memory update (plan 3 executed + findings).

---

## Review ledger (2026-07-11, two Opus adversarial agents: port-coverage + soundness; all findings folded above)

- **COV-1 HIGH** styles.css + uno.config.ts were unmapped → Task 9 file list (verbatim css port + presetAidx config); shadow.ts's `?inline` + `@property` hoist named.
- **COV-2/3 HIGH** Task 10 targeted the wrong file and missed the second mount path → corrected to `core/extensions.ts::extensionsModuleSource` + `nextjs-widget.ts`; smoke BOTH examples.
- **COV-4 MED** `lib/ui-snapshot.ts` behavior → pane-local restore ported (Task 4); draft fields superseded by server drafts row; shell snapshot superseded by router history.
- **COV-5/6 MED** IT disposition table added (every old test ported or DROPPED with reason; style-regression + storybook dropped).
- **COV-7 LOW** fallowrc stale widget/api-client entries removed; `@conciv/page` locked PRIVATE (embed inlines it).
- **COV-8/SND-5 LOW** apps-tests rule corrected (`apps/examples/*` only).
- **COV-9 LOW** `createFabRobotRig` (not FabRobot); shell-contract replaced-not-ported; single-history-instance bundle check noted.
- **SND-1 MED** TWO bundle outputs restored (externalized mount.js + self-contained global IIFE for ITs) — single externalized bundle cannot boot in a bare page.
- **SND-2 MED** sessions list = plain solid-query; TanStack DB collections deferred until a reactive join exists.
- **SND-3 LOW** page glue: `PageQuerySchema.parse(query)` + `{requestId, data}` rewrap (requestId moved to sibling in contract v4).
- **SND-4 LOW** conciv_ui card reads `part.arguments`; `onCustomEvent` deleted if unconsumed.
- **SND-6 LOW** app/embed uno.config.ts explicitly created.
- **SND-7 note** 50ms snapshot cadence assessed fine at chat scale.
- Reviewer-verified sound: scaffold CLI command; solid-router injected history + context + useBlocker; history pin exactness (1.162.0); db/query version matrix; approval-card keying matches server; connectionStatus gate; loopback CORS.
- **User amendment folded (2026-07-11, remodeled twice on user push): the app's URL in OUR db** — Task 0 (contract v4.1 `navigation.get/set`, TYPED NavigationStateSchema — the router IS the app's URL; no 'layout'/'appState' vocabulary), embed injects a db-backed Storage adapter into the unchanged storage-history package; hydrate-once + debounced write-behind; multi-tab last-write-wins (same as the localStorage it replaces).
