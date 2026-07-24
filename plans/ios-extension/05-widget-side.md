# 05 — Widget-side work

> **Review fixes (review-01-codex): B1, B2, M13.** This file now carries the **exact type signatures** for
> the host-level `grabProvider` seam (B1) and the public `handle.rebind` API with disposal semantics (B2),
> since the review requires them to be pinned here rather than implied. The `launcher` field stays a **new
> explicit settings field**, never shorthand for `modal:false` (M13); the README no longer says otherwise.
>
> **Review fixes (review-02/03/04): grabbable threaded through GrabApi (D9/codex-major), window grab-seam
> DELETED (D1/M-A7), launcher is a 3-way field (D17), openPanel tolerant of bootNormal (D18/feasibility-4),
> rebind scoped to same-core port drift + connection-generation (D8/M-A15), safe-area for full-bleed sheet
> (D12/m-A16).** `grabbable` lives on `GrabApi` itself and is returned by `makePaneGrabApi` so it reaches
> the composer. `launcher` becomes `'native' | 'mascot' | false`. `openPanel` opens the panel shell and
> resolves the session lazily (no navigation to a nonexistent connect route under `bootNormal`). `rebind`
> handles **same-core port drift only** (preserving nav/session state); switching cores = fresh mount.

Changes inside `@conciv/embed`, `@conciv/grab`, `@conciv/contract`, and `apps/conciv` so the widget behaves
correctly as an embedded native host. Each item is small and independently testable. The responsive pass is
a **separate prerequisite PR**, called out below.

## 0. Host-level `grabProvider` seam (B1) — exact signatures

The composer grab button drives whatever `grab` the nearest `HostApiProvider` supplies, and that is always
`makePaneGrabApi(pane.grabStore)` (`apps/conciv/src/chat/chat-pane.tsx:375`,
`apps/conciv/src/routes/panel.$sessionId.$view.tsx:55`), which hardwires the web `@conciv/page` adapter
(`apps/conciv/src/extension/pane-grab.ts:2,6`). No extension can change that (`.client()` yields only
`value`). The seam is host-level, threaded from `ConcivInit` to `makePaneGrabApi`. Signatures and touched
files:

1. **`packages/grab/src/grab.ts`** — `GrabApi` itself gains optional `grabbable?: () => boolean` (D9, see
   `01`), and the neutral provider types (no DOM types, Phase 0 discipline):

   ```ts
   export type GrabActions = Pick<GrabApi, 'pick' | 'comment' | 'cancel' | 'isActive' | 'grabbable'>
   export type GrabProvider = () => GrabActions
   ```

   `grabbable` is picked FROM `GrabApi` (not a bolted-on `GrabActions`-only field), so whatever a provider
   returns for `grabbable` survives onto the `GrabApi` the composer reads — the D9 fix.

2. **`packages/embed/src/mount.ts`** — `ConcivInit` gains the field:

   ```ts
   export type ConcivInit = {
     extensions?: ExtensionsInput
     settings?: ConcivSettingsInit
     apiBase?: string
     grabProvider?: import('@conciv/grab').GrabProvider // NEW (B1) — the ONLY grab seam (D1)
   }
   ```

3. **`packages/embed/src/mount-impl.tsx`** — `boot()` reads `init.grabProvider` and passes it into
   `createConcivRouter` in both `bootNormal` and `bootConnect`. **No `window.__CONCIV_GRAB_PROVIDER__`
   fallback (D1/M-A7/feasibility-3): the seam is deleted.** Because the native page is core-served and built
   from `native-entry.ts` (which calls `createConciv` with the provider), there is no `mountConciv`-with-no-init
   delivery that needed a window seam, so there is no import-order race and no `sideEffects` flag to pin.

4. **`apps/conciv/src/router.ts`** — `ConcivRouterConfig` + `ConcivRouterContext` gain
   `grabProvider?: GrabProvider`; `createConcivRouter` forwards it into `context`.

5. **`apps/conciv/src/extension/pane-grab.ts`** — take the provider and **return `grabbable`** so it is not
   erased (D9):

   ```ts
   export function makePaneGrabApi(store: PaneGrabStore, provider?: GrabProvider): GrabApi {
     const actions = provider?.() ?? pageGrabApi
     return {
       pick: actions.pick,
       comment: actions.comment,
       cancel: actions.cancel,
       isActive: actions.isActive,
       grabbable: actions.grabbable, // NEW (D9)
       stage: store.stage,
       staged: () => store.grabs().flatMap((entry) => ('preview' in entry ? [entry] : [])), // Phase 0 rename
       clear: store.clear,
     }
   }
   ```

   (`'snapshot' in entry` → `'preview' in entry` is the Phase 0 change, `01`.) The returned `GrabApi` now
   carries `grabbable`, so §4's composer can read it directly off `grab` — nothing is dropped.

6. **`apps/conciv/src/chat/chat-pane.tsx` + `.../routes/panel.$sessionId.$view.tsx`** — read the provider
   from router context (`useRouteContext`/the app's context accessor) and pass it:
   `makePaneGrabApi(pane.grabStore, ctx.grabProvider)`.

The native provider (`makeNativeGrabProvider`, `@conciv/extension-ios/client`) is passed via `ConcivInit`
by the **core-served native page entry** (`03` D1) — the single seam. It is a **singleton** over the one
native transport (M-A6/D10): a new pick from any pane supersedes the prior globally. Web with no provider
is byte-for-byte unchanged (default `pageGrabApi`).

## 1. `launcher: 'native' | 'mascot' | false` mount option (D17)

**Problem.** Native apps usually get their launcher from the SDK FAB (`04`), so the web mascot FAB
(`apps/conciv/src/shell/fab.tsx`, `ShellFab`) must not also appear (two launchers). **But** the user may
also want the **web mascot** to be the launcher inside the native host (personality); in that case the
native side shrinks the WebView touch region to the mascot rect when closed (`04` hitTest, D17).

**Current gate.** `ShellFab` renders behind `<Show when={settings.modal.enabled}>`
(`apps/conciv/src/routes/__root.tsx:238`). `settings.modal` (`WidgetConfig.modal`,
`packages/protocol/src/config-types.ts`) is `boolean | ModalConfig` and carries FAB position + "is this a
modal widget at all," so overloading it for launcher choice is muddy.

**Recommendation (D17).** Add an explicit three-way `launcher?: 'native' | 'mascot' | false` (cleanest
against `config-types.ts` where `modal` is already a non-boolean union) to `ConcivSettingsInit`
(`config-types.ts`), defaulting to `'mascot'` (unset = today's web mascot behavior, unchanged). Thread it to
the settings parser (`conciv/settings`, used at `mount-impl.tsx:125`):

- `'native'` (SDK default, the native entry passes it) → **suppress `ShellFab`** regardless of `modal`; the
  native FAB is the launcher.
- `'mascot'` → render the web mascot `ShellFab` as usual; the page reports the mascot's frame in the
  `host.panelToggled` `mascotRect` (`02`/D17) so native shrinks the closed touch region to it.
- `false` → no launcher at all (neither mascot nor an implied FAB).

Keep `modal` for position/behavior. Additive settings field (v0, no compat concern).

- Files: `packages/protocol/src/config-types.ts` (add `launcher?: 'native' | 'mascot' | false` to
  `ConcivSettingsInit`), the settings parser (`apps/conciv/src/data/settings.ts` and/or `conciv/settings`),
  `apps/conciv/src/routes/__root.tsx:238` (gate: render `ShellFab` only when `launcher === 'mascot'`, i.e.
  `launcher === 'mascot' && modal.enabled`), and the `host.panelToggled` payload builder (report
  `mascotRect` when `launcher === 'mascot'`).

## 2. Embedded-host open/close signal

**Problem.** The spike opened the panel by dispatching `conciv:open-panel` on a 600ms `setInterval` until
it stuck (appendix `overlay.html`). Root causes:

- `defaultOpen` only auto-opens when the route is exactly `/` (`__root.tsx:198`:
  `if (settings.defaultOpen && closedMatch()) void openPanel()`). In an embedded WebView the initial route
  is fine, but the open also requires a _connected_ core: `openPanel` → `latestSessionId()` →
  `sessions.list` + `sessions.resolve` (`__root.tsx:168-172`). Before the handshake binds `apiBase`, those
  fail, so a single early dispatch is dropped — hence the retry loop.

**Target.** A first-class programmatic open/close the native side calls after the handshake, and that
tolerates the not-yet-connected state.

**Recommendation (two parts):**

- **Programmatic handle.** Extend `ConcivHandle` (`packages/embed/src/mount.ts:14`) with `open()` /
  `close()` / `toggle()` that post the intent to the running router. Implementation: the router already
  listens for `window.dispatchEvent(new CustomEvent('conciv:open-panel'))` (`__root.tsx:200`); add a
  matching `conciv:close-panel` listener and have the handle dispatch these. The ios extension client
  (`03`) calls `handle.open()` on the native `open` bridge message. (The extension client does not hold
  the `ConcivHandle`; simplest is for it to dispatch the same custom events directly — keep the events as
  the stable seam and document them.)
- **Make the open tolerant of the `bootNormal` reality (D18/feasibility-4).** The native path does **not**
  go through `bootConnect`, so the "navigate to the connect route" idea in the earlier draft cannot fire:
  under `bootNormal` `connected` is hardwired `() => true` (`mount-impl.tsx:60`) and the connect route only
  exists in `bootConnect`'s memory history — an implementer following the old text would navigate to a route
  that does not exist. The honest fix: `openPanel` **opens the panel shell first and resolves the session
  lazily**. Concretely — open the panel (the modal/panel route the widget already has under `bootNormal`)
  immediately, and resolve `latestSessionId` (`sessions.list`/`resolve`) **after** the shell is shown,
  tolerating a failing/empty `sessions.list` (show the panel's own empty/loading state rather than dropping
  the open). Do **not** navigate to a connect route. This removes the retry loop without inventing a
  `bootConnect`-only path.

Acceptance: a single `handle.open()` (or one `conciv:open-panel` dispatch) reliably opens the panel shell in
an embedded `bootNormal` host even if `sessions.list` has not resolved — no polling, no navigation to a
nonexistent connect route.

## 2b. Public `handle.rebind(apiBase)` for port drift (B2)

**Scope (D8/M-A15): SAME-core port drift only.** `rebind` handles the same core process moving to a new
port, **preserving nav/session state** (that is the point). Switching to a **different** core is **unmount +
fresh mount** (the native SDK reloads the WebView at the new URL), never `rebind`, so no core-A nav state
survives into core B. This narrows the earlier draft, whose AC wrongly tested core-swapping.

**Problem.** The initial base is same-origin (`02` D1), but the same core moving ports mid-session needs a
re-point without relaunch. `boot()` binds the base once (`mount-impl.tsx:126`), `bootNormal` fixes a
`makeRpcClient` (`:54`) and hardwires `connected: () => true` (`mount-impl.tsx:60`), the router builds
`AppData` once from that rpc client (`router.ts:47`, `makeAppData(config.rpc, queryClient)`), and the only
rebind path is the private `bindApiBase` inside `bootConnect` (`:92`) — plus `makeDeferredRpcClient.bind`
throws if already bound (`packages/contract/src/client.ts:26`). So reassigning a URL alone does **not**
re-fire the `connected` effects (it is a constant) and does not rebuild `AppData`.

**Target — a public rebind that recreates the page plane AND re-points the rpc link, with a connection
generation:**

- **`packages/contract/src/client.ts`** — make the RPC link **rebindable**. The link `url` is already a
  function reading a mutable `base` (`client.ts:17-19`); add a `rebind(apiBase)` that reassigns `base`
  (distinct from `bind`'s throw-if-bound guard). Export a `makeRebindableRpcClient(): {rpc; rebind}` whose
  target can move.
- **`packages/embed/src/mount-impl.tsx`** — `bootNormal` uses the rebindable client. `boot()` returns a
  `rebind(apiBase)`. `rebind` must, in order: dispose the current page plane (`plane.dispose()`), re-point
  the RPC client at the new base, **recreate the page plane** against it, clear the router query cache
  (`router.options.context.queryClient.clear()`), and **bump a connection-generation signal** so the
  connected effects re-run. Because `connected: () => true` is a hardwired constant that never changes, the
  minimal honest mechanism is a **connection-generation `Accessor<number>`** (or a reactive `connected`
  signal) that `rebind` increments and that every RPC-stream/query consumer observes — so streams tied to
  the old base tear down and re-subscribe against the new one. In-flight SSE/streams are aborted by the
  plane dispose; document this. (Nav/session state is deliberately preserved — the router history is not
  reset — because this is same-core drift, D8.)
- **`packages/embed/src/mount.ts`** — `ConcivHandle` gains `rebind(apiBase: string): Promise<void>` (thread
  `mountImpl`'s `rebind` up through `createConciv`, guarded so it no-ops before mount / after unmount). Keep
  the `conciv:rebind` `CustomEvent` as the documented DOM seam, mirroring the open/close seam.

The native entry wires `handle.rebind` to the ios client, which calls it on a `handshake` whose base differs
from the bound one **for the same core** (`02`/`03`); a different core makes the SDK reload the WebView
instead (`04`).

Acceptance (D8): with the widget connected, calling `handle.rebind(newBase)` for the **same mock core moved
to a new port** re-points chat/SSE/RPC, keeps the panel open, keeps nav/session state, and leaks no data
from the old plane. Test the **port-drift** case (one mock core, new port) — **not** core-swapping (that is
a fresh mount, which the test should assert takes the unmount+remount path, not `rebind`).

## 3. Grab source-field rendering

Phase 0 (`01`) already keeps `source.componentName`/`filePath`/`lineNumber`, and `grab-reference.tsx`
already renders `in {sourceLabel(source)}` (`grab-reference.tsx:35-37,68-76`). For native grabs:

- When `source.filePath === ''` but `componentName` is set (the v1 native case, `03`), `sourceLabel`
  currently returns `componentName ? \`${componentName} at ${where}\``with`where === ''`→ renders
"PaymentCardCell at ". **Fix`sourceLabel`** to handle empty `filePath`: show just `componentName`
  (e.g. "in PaymentCardCell") when there is no file. Small, self-contained edit with a unit test.
- No other change: the image-preview arm already renders via Phase 0's `ScaledSnapshot` image branch.

## 4. Grab-disabled state (capability-driven)

**Problem.** The grab button silently no-ops when the host has no grabbable surface (true on web when a
page has no `data-conciv-source` elements, and on native when a screen has nothing interesting).

**Target.** The grab affordance reflects a capability signal and disables itself when nothing is grabbable.

**Recommendation (D9).** The signal is the **`grabbable?: () => boolean` on `GrabApi` itself** (added in
`01`, returned by `makePaneGrabApi` in §0) — **not** a parallel `GrabActions`-only field the adapter would
drop. The composer reads `grab.grabbable?.()` off the same `grab` it already has, so nothing is erased
between the provider and the button. Sources:

- **Native:** the provider's `grabbable()` reflects the last `grabCapability` bridge message (`02`) — the
  SDK answers cheaply from its hit-test/anchor registry.
- **Web:** the react-grab adapter reports whether any `data-conciv-source` element exists; **default `true`
  when `grabbable` is absent** so existing web hosts are byte-for-byte unchanged.

The grab button lives in the composer action area (terminal has its own at `terminal-actions.tsx:106`; the
main composer has the equivalent). Wire `disabled={grab.grabbable ? !grab.grabbable() : false}` + a tooltip
explaining why.

## 5. Mobile-width responsive pass — SEPARATE PREREQUISITE PR

**Problem.** The widget panel clips at 393px (iPhone logical width). This is a real but orthogonal chunk
of CSS work and must not be entangled with the native plumbing.

**Scope (its own PR, can run in parallel from M2):**

- Audit the panel layout (`apps/conciv/src/routes/panel.tsx`, the chat pane, composer, tool cards) at
  ≤393px and ≤430px widths.
- The panel today is a floating modal with stored width/height (`panel.tsx:49-56`,
  `conciv-modal-width`/`-height`). On a phone-width host it should go full-bleed (or near it) rather than
  a small floating card — likely a breakpoint that switches to a full-width sheet.
- **Safe-area insets (D12/m-A16).** The core-served native page sets `viewport-fit=cover` (appendix A.5),
  so the full-bleed sheet must pad with `env(safe-area-inset-top/right/bottom/left)` — the composer and
  header must clear the home indicator, notch, and status bar. This is the page-side half of the D12
  keyboard/safe-area work; the SDK ensures the WebView actually extends edge-to-edge so the insets are
  meaningful (`04` §1b).
- Tool cards, code blocks, and the composer must not cause horizontal overflow (same discipline as the
  artifact/responsive rules elsewhere in the repo).
- Verify with Playwright screenshots at phone viewports (layout = screenshots, not assertions, per
  `no-dom-measurement-tests`).

Acceptance for this PR: the panel renders without clipping or horizontal scroll at 320/375/393/430px, in
both light and dark, with the live widget (wait for `domcontentloaded` / a UI signal, never
`networkidle` — the SSE stream never idles, per repo rule).

## Acceptance criteria (items 0-4)

- **AC0** — With `grabProvider` passed to `createConciv` (the **only** seam — no
  `window.__CONCIV_GRAB_PROVIDER__`, D1), the composer grab button drives the provider's
  `pick/comment/cancel/isActive`, and `grab.grabbable` survives to the composer (D9); with no provider, web
  grab is byte-for-byte unchanged. `handle.rebind(newBase)` re-points a connected widget on **same-core port
  drift** without relaunch, preserving nav/session, leaking no state from the old plane (D8).
- **AC1** — `launcher: 'native'` (SDK default, D17) shows no `ShellFab`; `launcher: 'mascot'` (or unset)
  shows the mascot and reports `mascotRect`; `launcher: false` shows neither; `modal` still controls FAB
  position. Existing web demos (unset) still show the mascot unchanged.
- **AC2** — One `handle.open()` opens the panel **shell** in a `bootNormal` embedded host with no retry
  loop, even before `sessions.list` resolves and without navigating to a nonexistent connect route (D18);
  `handle.close()` closes it; `open`/`close` are set-state (idempotent); the
  `conciv:open-panel`/`conciv:close-panel` events remain the documented seam.
- **AC3** — A native (empty `filePath`) grab renders "in PaymentCardCell" with no trailing "at "; a web
  grab with a real file renders unchanged. Unit test on `sourceLabel`.
- **AC4** — The grab button disables when `grab.grabbable?.()` is false and re-enables when true (read off
  `GrabApi`, D9); web hosts with no capability signal behave exactly as today.
