# 02 — Bridge protocol (page ⇄ native)

> **Review fixes (review-01-codex): B2, B4, M6, M7, M8, M11.** Added a `bridge.ready` readiness state
> machine with sequenced, queued, acknowledged Native→Page delivery (M7); pinned the handler to the main
> frame + committed origin (M6); made `apiBase` arrive **before** mount and re-bindable via a public
> handle API rather than post-mount mutation (B2); specified deterministic grab concurrency mirroring the
> web `pendingResolve` (M8); replaced the never-adopted `host.dumpHierarchy` with a bounded **grab-attached
> view subtree** (B4); and made "no silent drift" real via a canonical schema, generated exhaustive
> fixtures, strict unknown-key policy on both sides, and a golden encode comparison (M11).
>
> **Review fixes (review-02/03/04): protocol evolution (D3/B-A2/m-A17/feasibility-1,2), bridge robustness
> (D4/B-A1/M-A4/M-A5), singleton pick (D10/M-A6), subtree-in-text (D6/codex-new-B2), shared state machine
> (D11/M-A14), clientId (D13/M-A11), core-origin pin (D1/M-A12).** Version handling is now **in-band
> negotiation**: `handshake.hello` carries a supported `{minV, maxV}` range, native picks a version, and an
> incompatible range yields a visible `bridge.incompatible` widget error (never silent). Runtime receivers
> **ignore unknown keys** (additive evolution within a version) — `.strict()` is dropped at runtime and
> kept only for the fixture/negative tests. The conformance guarantee is downgraded to honest
> **decode-equivalence + roundtrip** (no byte-equal cross-language golden encode). Fixtures are a
> **hand-maintained table** of example payloads with a union-exhaustiveness test, not an arbitrary-schema
> walker. Added a **crashed** state (`webViewWebContentProcessDidTerminate` → reload → re-handshake), made
> `bridge.ready` re-posted until the first acked N→P call, made `handshake` retried-until-acked, made
> open/close **set-state** (ensure-open/ensure-closed, never toggles), the native pick a **singleton**,
> folded the subtree into **`grab.text`** so it reaches the model, added `clientId` to the handshake, and
> pinned origin to the **core origin** (page origin == core origin under D1 — no null-`file://` case).

The single JSON contract both platforms code against. It defines every message that crosses the
`WKWebView` boundary in either direction, the lifecycle handshake (including the `apiBase`/port/token
handoff), the readiness/queueing state machine, and a set of JSON fixtures that serve as the
cross-platform conformance suite (TS validates with zod; Swift `Codable` validates against the same
fixtures).

## Two directions, two transports

The spike used the two native primitives directly (see appendix). We keep them, wrapped in typed helpers.

- **Page → Native:** `window.webkit.messageHandlers.concivBridge.postMessage(json)`. One handler named
  `concivBridge` (registered in Swift via `userContentController.add(self, name: "concivBridge")`).
- **Native → Page:** `webView.evaluateJavaScript("window.__concivNative.<method>(<json>)")`. The page
  exposes a small, stable `window.__concivNative` object (installed by the ios extension client, see
  `03`). The spike used ad-hoc globals (`window.concivNativeGrabResult`); we consolidate under one
  namespaced object with a version field.

Android uses the identical message shapes over its own transport (`@JavascriptInterface` +
`evaluateJavascript`); see `09`.

### Handler security: main-frame + origin pinning (M6)

`WKScriptMessageHandler` is callable by any script in any loaded frame, and the WebView intentionally
loads mutable local dev content. The SDK (`04`) MUST, on every `didReceive`:

- reject the message unless `message.frameInfo.isMainFrame` is true;
- reject unless `message.frameInfo.securityOrigin` (or the committed `webView.url` origin) matches the
  pinned expected origin. Under the D1 delivery pivot the page is **served by the core**, so the page
  origin **is** the core (`apiBase`) origin — a single `http://127.0.0.1:<port>` (or the token-scoped
  variant) origin to pin, with no null-`file://` bundled-host case to special-case (M-A12 dissolves).
  Keep the main-frame check + handler teardown exactly as below;
- via `WKNavigationDelegate`, cancel any navigation whose target origin is not the pinned one (no
  redirect off the trusted page);
- call `userContentController.removeScriptMessageHandler(forName: "concivBridge")` on detach/teardown and
  re-add on re-attach, so a stale handler never survives a WebView reuse.

These are Swift-side obligations; the wire schema is unchanged, but the receiver contract is: **a message
from a non-main frame or a non-pinned origin is dropped and logged, never acted on.** Android mirrors this
by validating the calling context in the `@JavascriptInterface` methods.

## Where the schema lives

Co-locate with the extension, following the terminal precedent
(`packages/extensions/terminal/src/shared/protocol.ts`):

```
packages/extensions/ios/src/shared/bridge.ts    # zod schemas + inferred types + BRIDGE_VERSION
packages/extensions/ios/fixtures/bridge/*.json   # cross-platform conformance fixtures (one per message)
```

`bridge.ts` is imported by both the extension client (`03`) and its tests (`07`). The Swift SDK (`04`)
does not import TS; it re-declares matching `Codable` structs and its test target loads the same JSON
fixtures. The fixtures are the contract of record — a drift between zod and Codable fails a test on
whichever side loads a fixture the other side wrote.

## Message catalog

**Version handling = in-band negotiation (D3 / B-A2).** `bridge.ts` exports `BRIDGE_MIN_VERSION` and
`BRIDGE_MAX_VERSION` (both `1` in v1). Every message still carries a `v`, but the two peers do not assume a
single shared integer: `handshake.hello` advertises the page's supported `{minV, maxV}` range, native picks
the highest mutually-supported `v` and returns it on `handshake`, and if the ranges do **not** overlap
native posts `bridge.incompatible` which the page surfaces as a **visible** widget error (never a silent
brick). Once a version is agreed, evolution within that version is **additive**: a receiver **ignores
unknown keys and unknown `type`s** and logs them, rather than rejecting. This is why runtime schemas are
**not** `.strict()` (that lives only in the fixture/negative tests, M11 below) — a `.strict()` runtime
receiver would reject a peer that merely added an optional field, exactly the silent-brick failure B-A2
flags.

### Page → Native

| type                | payload                                                                            | meaning                                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bridge.ready`      | `{v, type}`                                                                        | Posted by the ios client immediately after it installs `window.__concivNative`, then **re-posted on a short interval** (e.g. 300ms) until the page observes its first acked Native→Page call (or an explicit `readyAck`) — no single-shot readiness (M-A4/D4). Gates all Native→Page delivery (M7, below).      |
| `handshake.hello`   | `{v, type, minV: number, maxV: number, clientId: string, bundleReady: boolean}`    | Page finished mounting; advertises its supported version range `{minV, maxV}` and a per-page `clientId` (D13, for future multi-device); asks native for connection info. Sent after `bridge.ready`, and **re-sent on every transition back to `ready`** so a rebind base is never dropped (M-A5/D4).            |
| `grab.pick`         | `{v, type, requestId: string, mode: 'activate' \| 'comment'}`                      | User tapped the grab affordance; enter native pick mode. `mode` mirrors `GrabApi.pick`/`comment`. A new pick supersedes any in-flight one **globally** (the native pick is a singleton, M-A6/D10).                                                                                                              |
| `grab.cancel`       | `{v, type, requestId: string}`                                                     | Page-initiated cancel (e.g. user hit Escape in the widget). `requestId` identifies which pick to cancel.                                                                                                                                                                                                        |
| `bridge.ack`        | `{v, type, seq: number}`                                                           | Acknowledges receipt of the Native→Page call with sequence `seq` (M7).                                                                                                                                                                                                                                          |
| `host.panelToggled` | `{v, type, open: boolean, connected: boolean, mascotRect?: {x, y, width, height}}` | Mirrors the existing `conciv:panel-toggled` event (`apps/conciv/src/routes/__root.tsx:174`); lets native shrink/grow the touch region. When `launcher: 'mascot'` (D17), the page reports the mascot's frame in `mascotRect` (window points) so native shrinks the WebView interaction region to it when closed. |
| `host.log`          | `{v, type, level: 'info' \| 'warn' \| 'error', message: string}`                   | Optional: forward widget console to native `NSLog` for device debugging.                                                                                                                                                                                                                                        |

### Native → Page (methods on `window.__concivNative`)

Every Native→Page call carries a monotonic `seq` and the page replies `bridge.ack {seq}` (M7).

| method                | argument                                           | meaning                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handshake`           | `{v, seq, apiBase: string, token: string \| null}` | Response to `handshake.hello`: the agreed `v` (highest mutually-supported), where the core is + optional pairing token. Authoritative for **re-binding** mid-session; the _initial_ base arrives before mount (see "handshake / apiBase handoff", B2). Delivered on the retry-until-acked path (M-A5/D4). |
| `bridge.incompatible` | `{v, seq, nativeMinV: number, nativeMaxV: number}` | Version ranges do not overlap. The page surfaces a **visible** widget error ("update the conciv SDK / widget to a compatible version") — never a silent no-op (B-A2/D3).                                                                                                                                  |
| `open`                | `{v, seq}`                                         | **Ensure-open** (set-state, not a toggle). Native FAB or `ensureOpen` → the widget guarantees the panel is open; re-dispatch is idempotent (D4).                                                                                                                                                          |
| `close`               | `{v, seq}`                                         | **Ensure-closed** (set-state, not a toggle). Idempotent; safe to re-dispatch after a state transition (D4).                                                                                                                                                                                               |
| `grabResult`          | `{v, seq, requestId, grab: NeutralGrab \| null}`   | Result of a `grab.pick`. `null` = user cancelled/superseded. Applied only if `requestId` is the current pending pick (M8).                                                                                                                                                                                |
| `grabCapability`      | `{v, seq, grabbable: boolean}`                     | Whether the current native screen has anything grabbable; drives the grab-disabled affordance (`05`).                                                                                                                                                                                                     |

### Readiness, queueing, and acks (M7)

Direct `evaluateJavaScript("window.__concivNative.<method>(...)")` can fire before the client installs
`window.__concivNative`, during a navigation/reload, after a request was superseded, or after the WebView's
**content process has been killed** (the dominant real failure mode for a long-lived transparent overlay,
B-A1). Native therefore runs a small state machine and never calls a method blindly:

```
loading ──(receives bridge.ready)──► ready ──(navigation starts / WebView reload)──► loading
ready ──(detach)──► torn-down
loading/ready ──(webViewWebContentProcessDidTerminate)──► crashed ──(native reloads page)──► loading
```

- **`loading`:** all outbound Native→Page calls are appended to an ordered queue, not dispatched.
- **On `bridge.ready`:** flush the queue in order, then dispatch subsequent calls immediately. Because the
  page re-posts `bridge.ready` until its first acked N→P call (M-A4/D4), a lost first `ready` cannot
  deadlock the bridge.
- **Every dispatched call carries `seq`** (monotonic). Native keeps it "unacked" until the page posts
  `bridge.ack {seq}`. If no ack arrives within a short window (e.g. 1s) and the state is still `ready`,
  re-dispatch. **Critical control messages (`handshake`, anything carrying a rebind base) are
  retried-until-acked and re-sent on every transition to `ready`** — they are never dropped after one
  timeout (M-A5/D4). Non-critical, superseded calls (a stale `grabResult`) are dropped and logged after a
  bounded retry.
- **On navigation start / reload:** return to `loading`, discard unacked non-idempotent calls that are no
  longer meaningful (a superseded `grabResult`), and keep only state that must be re-sent (the latest
  `handshake` base, the latest `grabCapability`). `handshake.hello` from the freshly-mounted client
  re-triggers a fresh `handshake`.
- **`crashed` (content-process termination, B-A1/D4):** on `webViewWebContentProcessDidTerminate`, native
  **reloads the page** (a killed content process leaves a blank WebView; reloading is the documented
  recovery). The reload drives a fresh `bridge.ready` → `handshake.hello` → `handshake` cycle. **Any
  pending pick resolves `null` and the pick overlay exits** so a crash mid-pick cannot strand the overlay
  or leak a promise.
- **`bridge.ready` is the readiness signal, not `handshake.hello`.** `handshake.hello` asks for the base;
  `bridge.ready` proves `window.__concivNative` exists. They are separate messages so native never
  dispatches into a page that has not installed the object.
- **`open`/`close` are set-state, never toggles (D4).** `open` = ensure-open, `close` = ensure-closed, so
  re-dispatch after any transition is safe and idempotent; native never has to track a fragile
  open/closed parity to avoid double-toggling the panel shut.

### Grab concurrency semantics (M8)

The web implementation resolves any earlier pending pick with `null` before starting a new one and ignores
stale results (`packages/page/src/grab-api.ts:18,24`: `pendingResolve?.(null)` then a `pendingResolve !==
resolve` guard). The native bridge preserves the identical determinism, keyed by `requestId`:

- **New pick supersedes:** when the client issues `grab.pick` with a new `requestId`, it first resolves any
  outstanding `pick()` promise with `null`, then records the new `requestId` as the sole pending pick.
- **Result application is guarded:** a `grabResult` is applied only if its `requestId` equals the current
  pending pick; late or duplicate `grabResult`s for a superseded/cancelled request are dropped and logged.
- **Timeout:** a pick auto-resolves `null` after a bounded interval (config, default e.g. 60s) so promises
  never leak; the client also posts `grab.cancel` so native can exit pick mode.
- **Cancel:** `grab.cancel {requestId}` resolves the matching pending pick with `null` and is idempotent.
- **Teardown/reload/crash:** on WebView teardown, the `loading` transition, or a `crashed` content-process
  termination (D4), the pending pick resolves `null` and native exits pick mode. Native, symmetrically,
  keeps only one active pick session and cancels the prior on a new `grab.pick`.
- **The native pick is a SINGLETON (M-A6/D10).** `makeNativeGrabProvider()` returns shared pick actions
  over the **one** native bridge transport, and `makePaneGrabApi` is constructed per pane (`05`). So a new
  pick from **any** pane supersedes the prior pick **globally** — there is one native pick session, not one
  per pane. This is intended (a single physical device screen can only be picked once at a time), and is
  stated as the contract in `05` §0 and the extension client (`03` M8) so no implementer expects per-pane
  isolation.

### Shared, platform-neutral bridge-client state machine (M-A14 / D11)

The ready/loading/crashed/torn-down machine, the outbound queue, the monotonic `seq`/ack bookkeeping, the
retry-until-acked policy for control messages, and the singleton-pick supersession are **platform-neutral
logic** — only the transport (post a message / receive a call) differs by platform. Extract this into a
shared module so Android does not re-implement (and drift from) it:

```
packages/extensions/ios/src/shared/bridge-client.ts   # state machine; transport injected
```

- The module exports a factory that takes an injected transport (`postToNative(json)` +
  `onNativeCall(handler)`) and returns the page-side client surface (`makeNativeGrabProvider`'s engine,
  `bridge.ready` re-posting, ack posting, handshake retry, incompatible handling). It references **no**
  WebKit or DOM specifics.
- iOS wires the transport to `window.webkit.messageHandlers.concivBridge.postMessage` +
  `window.__concivNative`. Android wires the identical machine to `@JavascriptInterface` (strings) +
  `evaluateJavascript` (`09`). For v1 Android imports it from `@conciv/extension-ios`; when Android lands
  as its own package the module graduates to its own shared package. Keeping it in `src/shared/` (not
  `client.tsx`) is acceptable for v1 because it is platform-neutral and transport-injected.

### `NeutralGrab` — the payload shape, and how the subtree reaches the model (D6)

The host-neutral `Grab` from Phase 0 (`01`), image arm, plus an **optional bounded view subtree** that is
the v1 replacement for the cut `ios.viewHierarchy` tool (B4). Expressed as wire JSON:

```jsonc
{
  "text": "Payroll Deposit · Acme Corp · Today · +$3,120.00",
  "preview": {"kind": "image", "dataUrl": "data:image/jpeg;base64,...", "width": 361, "height": 72},
  "rect": {"x": 16, "y": 232, "width": 361, "height": 72},
  "source": {"componentName": "PaymentCardCell", "filePath": "", "lineNumber": null},
  "subtree": {
    "class": "PaymentCardCell",
    "a11yId": "PaymentsScreen/payrollRow",
    "text": "Payroll Deposit",
    "rect": {"x": 16, "y": 232, "width": 361, "height": 72},
    "children": [
      {
        "class": "UILabel",
        "a11yId": null,
        "text": "Payroll Deposit",
        "rect": {"x": 28, "y": 240, "width": 180, "height": 20},
        "children": [],
      },
    ],
  },
}
```

**The subtree MUST be serialized into `grab.text` to reach the model (D6 / codex-new-B2).** Verified
against the send path: staging reduces every grab to `grab.text` only —
`grabs: pane.grabStore.grabs().map((grab) => grab.text)` (`apps/conciv/src/chat/chat-pane.tsx:341`), and
the pane store accepts only `Grab`/`{text}` (`apps/conciv/src/app/pane-context.ts:6`). There is **no**
extension storage, attachment, content part, or RPC that carries a side-channel `subtree` to the agent. So
in v1 `makeNativeGrabProvider` produces the neutral `Grab` with `grab.text` = the visible text **followed
by a compact, bounded, formatted rendering of the subtree**, e.g.:

```
Payroll Deposit · Acme Corp · Today · +$3,120.00

[view]
PaymentCardCell #PaymentsScreen/payrollRow (16,232 361×72)
  UILabel "Payroll Deposit" (28,240 180×20)
  UILabel "+$3,120.00" (…)
```

This is what demonstrably reaches the model through the existing `grab.text` path. It is **depth-capped**
(default 3), **node-capped** (a small fixed cap), and compact (one line per node) so it cannot blow the
context. The image preview still renders in the composer thumbnail (`grab.preview`), and the picked text
still reads naturally as the first lines.

- `text` — visible text of the picked subtree (spike `collectTexts`, appendix) **plus** the formatted
  subtree block above.
- `preview.dataUrl` — JPEG data-URL from render-and-crop capture (`04` §3, D5).
- `rect` — frame in window points (spike `frameInWindow`).
- `source` — see `03` for how `componentName`/`filePath` get populated (a11y-id + registered project
  root). The spike left `filePath` empty, which is exactly why the agent said "not in this repo"; `03`
  fixes the honest-minimum version.
- `subtree` — **optional** structured `ViewNode` = `{class, a11yId: string | null, text: string | null,
rect, children: ViewNode[]}`, bounded (depth + node cap). It is retained on `NeutralGrabSchema` for the
  SDK/tests and as the source the text renderer formats from; **it is not the model-transport in v1 — the
  formatted `grab.text` is.** A typed attachment/content part that carries the structured `subtree`
  directly is an **open question** (`10` Q12), deferred.
- `subtree` walks from the **anchor/accessibility geometry** the SDK owns (`04` §3, D5), not raw `UIView`
  subviews. When absent, the agent falls back to `ios.screenshot` (B4).

The zod schema **reuses the Phase 0 types** for the `Grab` portion — do not re-model `Grab`. The
`Grab`-assignable subset of `NeutralGrabSchema`'s `.parse` output (everything except `subtree`) is
assignable to `@conciv/grab`'s `Grab` with `preview.kind === 'image'`.

**Why not `ios.viewHierarchy` in v1 (B4).** An agent-pulled full-screen hierarchy would need the core
(where server tools run, `packages/core/src/app.ts:101`) to push a request into the WebView and await a
native answer. No such server→WebView channel exists for extension tools — the only out-of-band path is
`conciv_ui`/`uiReply` (`packages/core/src/api/rpc/chat.ts:30`, `packages/core/src/chat/gate.ts:97-153`),
which is driven by an agent _tool call_ the client observes on the attach stream, not a server-tool pull.
And `xcrun simctl ui` sets appearance/preferences, not a view tree, so there is no server-side fallback.
v1 therefore delivers screen context two ways that need no new channel: `ios.screenshot` (visual) and the
grab-attached subtree **folded into `grab.text`** (D6 — the grab staging path carries only `grab.text`, so
the structure rides there; a typed structured attachment is deferred, `10` Q12). The deferred agent-pulled
full-screen route is specified in `10` Q3.

## The handshake / apiBase handoff (fixes the port-drift hack) — B2

The spike hardcoded `pw-api-base` in `overlay.html` and it broke when the core moved ports. A "mount, then
set the base from the handshake" flow **does not work**: `boot()` reads the base exactly once
(`packages/embed/src/mount-impl.tsx:126`) and `bootNormal` captures it into a fixed `makeRpcClient` (`:54`);
writing a global afterward neither replaces that client nor starts a deferred bind. Under D1 the base is
settled **at boot** for free — the page is core-served, so its own origin is the base (no injection, no
handshake dependency for the initial connection) — and re-binding on same-core drift needs a **public handle
API**.

### Initial connection: base is the served page's own origin (D1)

Under the D1 delivery pivot the **core serves the native page**, so the initial `apiBase` is trivially the
page's own origin — no `WKUserScript@documentStart` injection is needed for the initial connection:

1. Native decides the core URL (config, discovery, or pairing — see `06`) and the optional token, and
   builds the native-page URL (`http://127.0.0.1:<port>/<native-page-route>`, or the `/t/<token>/...`
   variant, `06`/D13).
2. Native loads the WebView at that URL. The page is same-origin with the core; the native entry passes
   `apiBase: window.location.origin` (or `resolveApiBase()` returns it) into `createConciv`, so `bootNormal`
   binds it with no race, no handshake dependency, and no cross-origin/null-origin case.
3. The ios client installs `window.__concivNative`, posts `bridge.ready` (re-posted until acked, D4), then
   `handshake.hello` (`{minV, maxV, clientId, bundleReady: true}`).
4. Native replies `handshake({v, apiBase, token})` (agreed version). On the _first_ handshake this is
   confirmatory (the base already bound at boot); its real job is **re-binding** on same-core port drift.

### Re-binding on SAME-core port drift: `handle.rebind(apiBase)` (D8)

`ConcivHandle` (`packages/embed/src/mount.ts:14`) gains `rebind(apiBase: string): Promise<void>` (spec in
`05`/`06`). **Scope (D8/M-A15): rebind handles SAME-core port drift only** — the same core process moved to
a new port and nav/session state is intentionally **preserved**. \*\*Switching to a different core = unmount

- fresh mount** (native reloads the WebView at the new URL), never rebind, so no core-A nav/session state
  survives into core B. On a `handshake` whose base differs from the bound one (same core, new port), the ios
  client calls `handle.rebind(newBase)`, which: swaps the RPC target, **recreates the page plane and
  re-points the rpc link**, clears the query cache, and re-runs the connected effects via a
  **connection-generation signal\*\* (the current `connected: () => true` is hardwired and does not re-fire on
  a URL swap — `mount-impl.tsx:60`/`router.ts:47`; the minimal honest mechanism is specified in `05` §2b). No
  app relaunch. This is the public replacement for the private `bindApiBase` (`mount-impl.tsx:92`, only
  reachable through `bootConnect` today). Note: after a same-core port rebind the still-loaded page origin is
  the old port, so the re-pointed RPC is briefly cross-origin to the new base; the core's `allowedOrigins`
  must include the served origin (it already does for its own page), so CORS holds. Disposal semantics and the
  rebindable RPC client are specified in `05` (widget) and `06` (transport). The native
  entry that calls `createConciv` wires `handle.rebind` to the ios client (or exposes it as the documented
  `conciv:rebind` custom-event seam, `05`).

This removes the `setInterval` open hack (a separate concern — see `05`) and the hardcoded meta.

## Conformance fixtures + honest drift protection (M11, rewritten — D3)

The earlier plan promised **byte-equal cross-language golden encode** over an **arbitrary-zod-schema-walking
generator**. Both are rejected (D3 / codex-11 / feasibility-1,2 / m-A17):

- **Byte-equal golden encode across languages is un-passable without inventing a canonicalizer.**
  `JSON.stringify` emits insertion order; Swift `JSONEncoder` is unordered (or `.sortedKeys`); float-vs-int
  formatting differs. There is no named canonical stringify mandated, so AC3 as written could not be met.
- **A generator that walks arbitrary zod schemas** to synthesize valid values and bound the
  optional-combination explosion is substantial, unspecified engineering behind a checkbox, and it gated
  both `swift test` and the CI drift check.

The honest guarantee is **decode-equivalence + roundtrip**, over a **hand-maintained fixture table**:

1. **Canonical schema = the zod in `bridge.ts`** (single source of truth), but **runtime receivers are NOT
   `.strict()`** — they ignore unknown keys so additive evolution within a version does not brick a peer
   (D3). `.strict()` variants are used **only** in the fixture/negative tests to prove the `invalid/` cases
   are structurally wrong (missing required field / wrong type), not to police unknown keys at runtime.
2. **Hand-maintained example table.** A committed TS table (`packages/extensions/ios/fixtures/bridge/`,
   authored as data, e.g. `fixtures.ts` that writes the `*.json`) lists, **per message variant**, concrete
   example payloads: at least one **valid**, at least one **invalid** (missing/mistyped required field),
   and at least one **unknown-key** case (to prove the runtime IGNORES it and the strict test flags it).
   No schema walking; a human writes representative payloads.
3. **Union-exhaustiveness test (vitest).** A test asserts that **every member of the `BridgeMessage` union
   has fixture-table entries** — iterate the discriminated union's `type` literals and fail if any lacks a
   valid + invalid + unknown-key entry. This is the mechanical guarantee that replaces the schema-walker:
   the table can never silently miss a variant, but the payloads themselves are hand-written and reviewable.
4. **Decode-equivalence + roundtrip, both sides.** For each valid fixture: it **decodes** on TS (zod
   non-strict) and on Swift (Codable ignoring unknown keys); each side **re-encodes** and the value is
   **re-decoded on the OTHER side**, asserting **value-level equality after normalization** (parse both
   JSON blobs to a canonical in-memory value and compare — NOT byte-equal strings). Every `invalid/` fixture
   fails to decode on both sides; every unknown-key fixture decodes (ignored) on both sides.

Directory layout, one JSON file per message, named `<direction>.<type>.json`:

```
p2n.bridge-ready.json         n2p.handshake.json
p2n.grab-pick.json            n2p.grab-result.json
p2n.grab-cancel.json          n2p.open.json          n2p.close.json
p2n.bridge-ack.json           n2p.grab-capability.json
p2n.host-panel-toggled.json   n2p.bridge-incompatible.json
p2n.handshake-hello.json
invalid/*.json                # missing/mistyped required field per variant
unknown-key/*.json            # extra key per variant (must DECODE, ignored, on both sides)
```

- **TS side (`07`):** a vitest suite iterates every fixture and the union-exhaustiveness test; valid +
  unknown-key files `.parse` (non-strict), `invalid/` files fail the strict schema, and the roundtrip
  compares normalized values across a TS-encode → TS-decode cycle (the cross-language leg is the Swift job).
- **Swift side (`04`/`07`):** an `XCTest` decodes each valid + unknown-key fixture into the matching Codable
  struct (**default Codable already ignores unknown keys** — no custom `init(from:)` needed), re-encodes,
  and asserts the re-encoded value re-decodes to an equal value; each `invalid/` fixture must fail to
  decode. Swift reads a **committed copy** kept in sync by the drift-check (M12; under D2 the copy + a
  drift-check CI job live in the separate `conciv-swift` repo, `04`/`08`).

## Acceptance criteria

- **AC1** — `bridge.ts` exports a discriminated `BridgeMessage` union (by `type`) with a non-strict runtime
  zod schema per variant (unknown keys ignored), `BRIDGE_MIN_VERSION`/`BRIDGE_MAX_VERSION` (both `1`),
  `bridge.ready`/`bridge.ack`/`bridge.incompatible` included, `handshake.hello` carrying `{minV, maxV,
clientId}`, and inferred TS types. The `Grab`-assignable subset of `NeutralGrabSchema` output is
  assignable to `@conciv/grab` `Grab`.
- **AC2** — The fixture table is hand-maintained and checked in; the **union-exhaustiveness test** fails if
  any `BridgeMessage` variant lacks valid + invalid + unknown-key entries. Every valid/unknown-key fixture
  decodes on both TS and Swift; every `invalid/` fixture is rejected on both.
- **AC3** — **Decode-equivalence + roundtrip** passes per variant on both sides (decode → re-encode →
  re-decode to an equal value after normalization). NO byte-equal cross-language encode is asserted.
- **AC4** — No `apiBase` string is hardcoded in any page/Swift string; the initial value is the served
  page's own origin (D1), and a changed value re-binds via `handle.rebind` on `handshake` for **same-core
  port drift only** (a different core = fresh mount, D8).
- **AC5** — Native drops any message from a non-main frame or non-core-origin, queues Native→Page calls
  until `bridge.ready`, retries `handshake` until acked, re-posts `bridge.ready` until its first acked N→P
  call, recovers from `webViewWebContentProcessDidTerminate` by reload → re-handshake (pending pick →
  null), treats `open`/`close` as set-state, and a superseded/late `grabResult` never stages a grab
  (M6/M7/M8/M-A4/M-A5/B-A1).
