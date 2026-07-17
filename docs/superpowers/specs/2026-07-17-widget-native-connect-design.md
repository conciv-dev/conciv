# Widget-native connect — the demo IS the widget, shipped as an extension

Date: 2026-07-17
Status: approved (rev 2 — extension architecture)
Supersedes: the site stand-in (`TryPanel`/`TryWidget`) sections of
`2026-07-15-widget-first-connect-design.md` and the "Site panel" half of
`2026-07-17-try-connect-polish-design.md`. The CLI + core-hook half of the latter is
already implemented and stays.

## Problem

The connect demo is a React stand-in panel in `apps/site` that unmounts when the agent
connects, after which the real widget boots and pops open again onto a generic welcome
screen. Two open animations, one visible gap, no continuity. And the demo UI (pair
copy, docs links) does not belong inside the widget product either.

## Goal

The real widget mounts from the first frame. Pre-connect, its panel renders connect
steps provided by a **site-loaded extension**; when the agent's core appears, the panel
content swaps to live chat as a child-route navigation inside a persistent layout —
frame, FAB, and shutter never remount. The widget stays generic (zero conciv.dev
copy); npm consumers never ship the demo extension.

## Architecture

Three parties:

```
packages/extensions/try-it     NEW client-only extension: token, steps UI, probe loop
apps/conciv (+ embed)          generic connect-boot mode + /panel/connect route + host connect() API
apps/site                      instantiates tryIt({token}), mounts embed as a library
```

### Extension contract additions (`@conciv/extension`)

- `ExtensionSlot` union gains `'connect'`.
- `defineExtension` config gains `connectGate?: true` — declares "this extension
  drives the connect slot". (Slot rendering is dynamic via `useSlot()`, so boot needs
  this static capability flag.)
- Host API (available via extension hooks) gains, for the `connect` slot only:
  `connect: {origin: string, found: (apiBase: string) => void}`.

### `packages/extensions/try-it` (new package, client-only)

`tryIt(config: {token: string})` returns a `defineExtension({name: 'try-it', connectGate: true})
.client(...)` extension. Its `Component` switches on `useSlot()`:

- `slot === 'connect'`: the guided-steps pane, widget-token styled (pw-\*), ui-kit
  primitives (`TooltipIconButton` for copy):
  1. "Copy the agent prompt" — copy row `Read <origin>/pair/<token> and follow the instructions`;
     collapsed "or run it yourself" reveals `npx @conciv/try --token <token>`; copying
     either marks step 1 done.
  2. "Run it in your terminal" — hint "First run installs the package (~30s)".
  3. "Approve Chrome's local-network prompt" — informational copy.
     Plus headline "Drive this page with your agent.", pulsing waiting line, 60s
     slow-hint linking `/docs`, privacy line. Step state = pure `stepStates` model
     (moved from `apps/site/src/lib/try-steps.ts` with its tests).
     Probe loop: sweep `connectPorts()` (`@conciv/protocol/connect-ports`) every 2s for
     `http://127.0.0.1:<port>/t/<token>/health`; on hit show "Agent connected ✓" ~600ms,
     then call `host.connect.found(base)`.
- other slots: `null`.

No server part. Not included in any default bundle.

### Widget: connect boot (generic)

Boot branch in `packages/embed/src/mount.tsx`:

- API base resolvable → today's boot, unchanged.
- No API base AND some extension has `connectGate` → **preflight sweep first** (one
  concurrent probe of all connect ports, ≤2.5s — needs the token, so the sweep is
  performed by asking the gate extension: the capability flag carries it,
  `connectGate: {preflight: () => Promise<string | null>}`; try-it implements it with
  the same probe helper):
  - hit → NORMAL boot with the found base (bound rpc, `makeNavigationStorage`,
    storage history). Reloads with a live core behave exactly like today.
  - miss → connect boot: deferred rpc, in-memory history (TanStack
    `createMemoryHistory`), initial location `/panel/connect` with `?open=true` when
    `settings.defaultOpen`.
- No API base, no gate extension → today's behavior unchanged.

`/panel/connect` (new route, child of the persistent `/panel` layout): renders
`ExtensionSurface name="connect"`. The layout's frame/resize/FocusTrap persist across
the handoff navigation by construction.

Handoff (widget side, in the route): host `connect.found(base)` → `bind(base)` on the
deferred rpc → `rpc.sessions.resolve({})` → `navigate({to: '/panel/$sessionId',
params, replace: true})`. Failure between bind and resolve → surface returns to the
extension (waiting state resumes), error logged.

### Deferred rpc

`@conciv/contract` gains `makeDeferredRpcClient(): {rpc: RpcClient, bind: (apiBase: string) => void, bound: () => boolean}` —
stable proxy; calls before `bind` reject with `'conciv core not connected yet'`.
Router context gains `connected: Accessor<boolean>` (true immediately in normal boot).

### Pre-connect guards (widget)

- `__root.tsx` sessions query (FAB `working` state): `enabled: connected()`.
- FAB toggle, shutter (`?open`), Escape, resize: already rpc-free; boot lands on
  `/panel/connect` so `openPanel()`'s rpc path is unreachable pre-connect.
- Quick terminal hotkey: no-op until `connected()`.

### Contextual empty state (widget, generic copy)

When the session was entered via the connect handoff, chat `EmptyState` headline reads
"Agent connected — it's driving this page from your machine." (generic product copy;
lives in the widget). Starters unchanged.

### Host page events contract (site ↔ widget)

- Widget listens: `conciv:open-panel` window event → open shutter (site's "Try it
  live" button).
- Widget emits: `conciv:panel-toggled` `{detail: {open: boolean}}` — site records its
  dismissal cookie on pre-connect close.
- `conciv:widget-mounted` stays.

## Site changes (`apps/site`)

- DELETE: `TryPanel`, `TryWidget`, `TryOverlay`, `TryLauncher`, probe/mount logic in
  `connect-live.ts`, `try-steps.ts` (moved), their tests, and the
  `conciv-widget.global.js` script-injection path for the landing page.
- Landing mounts the widget as a library (like the nextjs plugin does): client-side
  `import {mountConciv} from '@conciv/embed'` + `terminal` client + `tryIt({token})`,
  after fetching the token cookie; meta `pw-widget` `{defaultOpen: <auto-open decision>}`.
  Skipped when a dev widget `[data-conciv-root]` exists. One Solid copy guaranteed by
  the site's bundler resolving embed's externals.
- URL contract kept: `?try=1` forces `defaultOpen: true`; first visit without
  dismissal cookie auto-opens; dismissal cookie set on `conciv:panel-toggled
{open: false}` pre-connect; "Try it live" dispatches `conciv:open-panel`.
- `/pair/$token` route, token session cookie, source manifest: unchanged.
- The prebuilt global bundle (`conciv-widget.global.js`) remains for non-bundler
  consumers; the site simply stops using it.

## Unchanged

`@conciv/try` CLI (clack UI, events), core `onClientRequest` hook, `/pair` text,
seeding, system prompt. CLI "Browser paired ✓" fires when the extension's probe hits.

## Rejected

- Mitosis cross-framework widget: outside its expressible subset (router, query, SSE,
  shadow DOM). React embedding API = future thin config components spec.
- `settings.connect` token channel: the token is demo state, not widget config — it
  rides the extension instance instead.
- Parallel non-router connect shell: duplicates chrome, swap remounts.

## Cleanup on this branch

The interim React guided-steps panel (commits `cbdfa254`, `0f831cbf`) is replaced;
files deleted during implementation. `stepStates` + tests move to the extension
package. Changeset already on branch covers the fixed `@conciv/*` line; add
`@conciv/extension-try-it` to `PUBLIC_PACKAGES` only if published (default: private,
site-only — NOT published, `private: true`).

## Error handling

- Probe failures silent; loop indefinite with 60s soft hint.
- Deferred rpc pre-bind call rejects loudly — bug signal, must not occur in flows.
- `found(base)` with dead core: bind succeeds, `sessions.resolve` rejects → route
  stays on `/panel/connect`, extension resumes polling.

## Core & testkit impact

**Core: no further changes.** The only core change this feature family needs is the
`onClientRequest` hook, already shipped on this branch. Token mounting
(`/t/<token>`), CORS via `allowedOrigins`, and `start()` extension mounting are used
as-is. The widget-side work is entirely client (embed, apps/conciv, extension
contract, contract package).

**`@conciv/extension-testkit` adjustments** (it currently assumes core-first boot
with a server part):

1. `ExtensionUnderTest.server` becomes optional — try-it is client-only. Without a
   server part, `bootExtensionServer` is skipped at setup.
2. New deferred-core flow: `getExtensionTestApi` gains
   `connect?: {token: string}` — the host page then boots the widget with NO
   `__CONCIV_API_BASE__` (connect-gate boot), and the returned api gains
   `startCore: () => Promise<{apiBase: string}>` which boots a token-gated core
   (`bootExtensionServer` with a new `accessToken` option, mounting the extension's
   server part if any) on a connect-range port. Tests drive: assert pre-connect UI →
   `await api.startCore()` → assert in-place handoff.
3. `launch.ts` gains local-network-access support (Chromium
   `--ip-address-space-overrides` + `local-network-access` permission grant, as the
   site e2e does) so the in-browser probe to `127.0.0.1:47xx` works.
4. Host runtime (`host-entry.tsx`) passes `pw-widget` settings meta (defaultOpen)
   through so connect boot opens the panel.
5. Unchanged guarantees: testkit keeps consuming the widget's real plumbing (no
   forks), still never depends on the vite plugin.

`bootExtensionServer` accepting `accessToken` + a fixed port range is the ONLY
testkit-server change; it forwards to `start()` options that already exist.

**Test pyramid for this feature (testing is the contract):**

- Unit (node): `stepStates`, probe/preflight helpers (against a local http server),
  deferred rpc bind semantics, `parseConcivSettings` (unchanged fields), extension
  `connectGate` flag plumbing.
- Extension IT (real browser via testkit, the primary integration surface): connect
  boot → steps visible → `startCore()` → SAME `[data-pw-panel]` node → chat live →
  contextual empty-state → CLI-relevant side effect (first probe hit fires core
  `onClientRequest`, asserted via the hook's callback in `startCore`).
- Widget IT (embed): connect-gate boot branch (preflight hit → normal boot; miss →
  `/panel/connect`).
- Site e2e: full flow on the built site (token cookie → widget → `runConnect` fake
  harness → handoff → chat turn), dismissal cookie, `?try=1`.

## Testing

- `@conciv/extension-try-it` unit (vitest, node): `stepStates`, probe helper against a
  local http server, preflight helper.
- `@conciv/contract` unit: deferred rpc bind semantics.
- Widget IT (real browser, prebuilt embed + extension via test fixture entry):
  connect-gate boot with no core → panel open with steps; start token-gated core
  (`runConnect`, fake harness); assert `[data-pw-panel]` is the SAME DOM node before
  and after handoff; composer appears; contextual empty-state headline shown.
- Site e2e (`live-connect.it.test.ts` rewrite): widget mounts on load with steps;
  `runConnect` → in-place flip; dismissal cookie on pre-connect close; `?try=1`
  forces open.
- `browser.newPage()`, `domcontentloaded` waits only.
