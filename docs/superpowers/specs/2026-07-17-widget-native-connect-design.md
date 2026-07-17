# Widget-native connect — the demo IS the widget

Date: 2026-07-17
Status: approved
Supersedes: the site stand-in (`TryPanel`/`TryWidget`) sections of
`2026-07-15-widget-first-connect-design.md` and the "Site panel" half of
`2026-07-17-try-connect-polish-design.md`. The CLI + core-hook half of the latter is
already implemented and stays.

## Problem

The connect demo is a React stand-in panel in `apps/site` that unmounts when the agent
connects, after which the real widget boots and pops open again onto a generic welcome
screen. Two open animations, one visible gap, no continuity. The 07-15 spec accepted
this by constraining "core, embed, app, try stay untouched"; that constraint is lifted.

## Goal

The real widget mounts from the first frame. Pre-connect it renders the connect steps
inside its own panel; when the agent's core appears, the panel content swaps to live
chat as a child-route navigation inside a persistent layout — the frame, FAB, and
shutter never remount. No stand-in, no double-open, no generic welcome.

## Architecture

Connect mode is routing, not a parallel shell:

```
/panel                ← existing layout route: frame, resize, FocusTrap (persists)
/panel/connect        ← NEW: ConnectPane (steps UI + probe loop)
/panel/$sessionId     ← existing chat
```

Boot branch in `packages/embed/src/mount.tsx`:

- API base resolvable (`resolveApiBase()` non-empty) → today's boot, unchanged.
- No API base AND `settings.connect` present → **preflight sweep first** (one
  concurrent probe of all connect ports, ≤2.5s timeout — the sweep the site used to
  run):
  - hit → NORMAL boot with the found base: bound rpc, `makeNavigationStorage`,
    storage history, full navigation persistence. Reloads with a live core behave
    exactly like today.
  - miss → connect boot: deferred rpc (see below), in-memory router history
    (TanStack `createMemoryHistory`), initial location `/panel/connect` with
    `?open=true` when `settings.defaultOpen`. `makeNavigationStorage` is skipped (it
    requires core); the first connected session runs on memory history, and the next
    reload takes the normal path above.
- No API base, no `connect` setting → today's behavior unchanged.

### Deferred rpc

`@conciv/contract` gains `makeDeferredRpcClient(): {rpc: RpcClient, bind: (apiBase: string) => void, bound: () => boolean}` —
a stable proxy object; calls before `bind` reject with a clear error. Context keeps one
stable `rpc` reference for the app's lifetime; ConnectPane calls `bind(base)` on probe
success. Router context gains `connected: Accessor<boolean>` (true immediately in
normal boot; flips on `bind` in connect boot).

### Pre-connect guards

- `__root.tsx` sessions query (`working` FAB state) and any other root-level queries:
  `enabled: connected()`.
- FAB toggle, shutter (`?open` search param), Escape, resize are rpc-free — already
  work pre-connect. Boot lands on `/panel/connect` so `openPanel()`'s rpc path
  (`latestSessionId`) is unreachable pre-connect.
- Quick terminal pre-connect: hotkey no-ops until `connected()`.

### ConnectPane (`/panel/connect` route)

Solid port of the guided-steps UI, styled with widget tokens (pw-\*), reusing ui-kit
primitives (`TooltipIconButton` for copy buttons):

1. "Copy the agent prompt" — copy row `Read <origin>/pair/<token> and follow the instructions`;
   collapsed "or run it yourself" reveals `npx @conciv/try --token <token>`. Copying
   either marks step 1 done.
2. "Run it in your terminal" — hint "First run installs the package (~30s)".
3. "Approve Chrome's local-network prompt" — informational copy.

Step state = the pure `stepStates` model (ported from `apps/site/src/lib/try-steps.ts`
into `apps/conciv/src/lib/try-steps.ts`, same tests). Plus: headline "Drive this page
with your agent.", pulsing waiting line, 60s slow-hint linking `/docs`, privacy line.

Probe loop: `apps/conciv/src/lib/connect-probe.ts` (moved from site's
`connect-live.ts` `probeCore`): sweep `connectPorts()` from
`@conciv/protocol/connect-ports` every 2s for `http://127.0.0.1:<port>/t/<token>/health`.
On hit: `bind(base)` → `rpc.sessions.resolve({})` → `navigate({to: '/panel/$sessionId',
params, replace: true})`. The route transition inside the `/panel` layout is the whole
handoff — brief "Agent connected ✓" state (~600ms) on the pane before navigating.

Token/origin come from `settings.connect: {token: string}`; origin for the pair URL is
`window.location.origin`.

### Settings

`parseConcivSettings` gains `connect?: {token: string}` (present only when the raw
config has `connect.token` as a non-empty string).

### Contextual empty state

When the session was entered from connect mode (router context flag set at handoff),
the chat `EmptyStateSlot` headline becomes "Agent connected — it's driving this page
from your machine." Starters unchanged.

### Host page events contract (site ↔ widget)

- Widget listens: `conciv:open-panel` window event → `setShutter(true)` (used by the
  site's "Try it live" hero button post-mount).
- Widget emits: `conciv:panel-toggled` `{detail: {open: boolean}}` on shutter changes.
  Site records its dismissal cookie on pre-connect close.
- Existing `conciv:widget-mounted` event stays.

## Site changes (`apps/site`)

- DELETE: `TryPanel`, `TryWidget`, `TryOverlay`, `TryLauncher`, `connect-live.ts`
  probe/mount logic (keep only a thin `mountWidget` that injects meta + script),
  `try-steps.ts` (moved into widget), their tests.
- Landing always mounts the widget (skipped when a dev widget `[data-conciv-root]`
  exists): meta `pw-widget` = `{defaultOpen: <auto-open decision>, connect: {token}}`,
  then the embed script (thin `mountWidget` keeps dispatching
  `conciv:widget-mounted`). No preflight probe, no poll loop in site code — the widget
  owns both.
- URL contract kept: `?try=1` forces `defaultOpen: true`; first visit without
  dismissal cookie auto-opens; dismissal cookie set when the widget emits
  `conciv:panel-toggled {open: false}` pre-connect. "Try it live" button dispatches
  `conciv:open-panel`.
- `/pair/$token` route, token session cookie, source manifest: unchanged.

## Unchanged

`@conciv/try` CLI (clack UI, events), core `onClientRequest` hook, `/pair` text,
seeding, system prompt. The CLI's "Browser paired ✓" now fires when ConnectPane's
probe hits — same mechanism, new caller.

## Rejected

- Mitosis for a cross-framework widget: the widget is a deep Solid app (router,
  query, SSE, shadow DOM, extensions) outside Mitosis's expressible subset. A React
  embedding API will be thin config components over the embed channel (future spec,
  not this one).
- Parallel non-router connect shell: duplicates chrome, swap still remounts. Routing
  inside the persistent `/panel` layout is strictly better.

## Cleanup on this branch

The interim React guided-steps panel (commits `cbdfa254`, `0f831cbf`) is replaced by
this work; its files are deleted as part of implementation. `stepStates` tests move
with the model. Changeset already on branch covers `@conciv/*` line.

## Error handling

- Probe failures are silent (expected while waiting); loop runs indefinitely with the
  60s soft hint.
- `bind` then rpc failure (core died between probe and resolve): pane returns to
  waiting state and resumes the loop.
- Deferred rpc called pre-bind: rejects with `'conciv core not connected yet'` — must
  never happen in shipped flows; a console error there is a bug signal.

## Testing

- `apps/conciv` unit (vitest, node): `stepStates` (moved), settings parsing with
  `connect`, deferred rpc bind semantics (`@conciv/contract` test).
- Widget IT (real browser, PREBUILT embed bundle — rebuild embed first): boot with
  `connect` settings and no core → panel open with steps; start a token-gated core
  (`runConnect` with fake harness); assert the `[data-pw-panel]` DOM node is the SAME
  element before and after handoff (the seamlessness invariant), chat composer appears,
  contextual empty-state headline shown.
- Site e2e (`live-connect.it.test.ts` rewrite): widget mounts on load with steps
  visible; `runConnect` → in-place flip; dismissal cookie set on pre-connect close via
  the toggled event; `?try=1` forces open.
- `browser.newPage()` not contexts; `domcontentloaded` waits only.
