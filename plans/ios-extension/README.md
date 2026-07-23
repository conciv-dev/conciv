# @conciv iOS extension — implementation plan

> **Review fixes (review-01-codex): B1, B3, B4, B5, M13.** This README is updated for the
> integration-seam redesign: the native path ships as a **distinct native embed entry** (not the
> plain global bundle) that passes a host-level `grabProvider` and `apiBase` into `createConciv`
> (B1/B3); `ios.viewHierarchy` is **cut from M3** and replaced by grab-attached view subtrees +
> `ios.screenshot` (B4); the Swift SDK is consumed via a **root `Package.swift` + bare-semver tags**
> (B5); and `launcher:false` is a real settings field, never shorthand for `modal:false` (M13).
>
> **Review fixes (review-02/03/04): two headline pivots + robustness.** (D1) The **core serves the native
> page** built from `packages/embed/src/native-entry.ts` — the **sole v1 delivery**, so page origin == core
> origin (same-origin RPC/SSE, no null-origin pinning), the `window.__CONCIV_GRAB_PROVIDER__` seam is
> **deleted** (`init.grabProvider` only), and there is **no SDK-bundled host HTML in v1**. (D2) The Swift
> SDK is a **hybrid**: source of truth in the monorepo (`native/swift/`, nested manifest — **no root
> `Package.swift`, no bare-semver tags in the monorepo**), distribution via a **mirror repo
> `conciv-dev/conciv-swift`** that release CI publishes (root manifest + bare-semver tags), killing the
> one-way-door risk. Plus: in-band **version negotiation** + additive tolerance + decode-equivalence
> conformance (D3); **crashed-state recovery**, re-posted ready, retried handshake, set-state open/close
> (D4); SwiftUI **SDK-owned anchors** (no a11y-tree walk) (D5); subtree folded into **`grab.text`** (D6);
> **optional/inert** iOS config (D7); rebind scoped to **same-core port drift** (D8); `grabbable` on
> `GrabApi` (D9); **singleton** native pick (D10); **shared bridge-client** state machine (D11); keyboard +
> safe-area (D12); token identity/lifetime + corrected `/t/<token>` rationale (D13); Release-build hygiene
> (D14); required Swift conformance CI + transcript re-record (D15); embed native-bundle wiring (D16);
> `launcher: 'native' | 'mascot' | false` (D17).

Self-contained plan for bringing the conciv widget into native iOS (and later Android) apps:
the **unforked** widget code runs in a transparent `WKWebView` overlay, a native "grab" pipeline
lets the agent see and reason about real UIKit/SwiftUI screens, and a set of first-class `ios.*`
tools drive the simulator build/run/inspect loop from inside the agent. "Unforked" means the widget
app/core carry zero iOS-specific branches; the native wiring (grab provider, apiBase injection,
native FAB) is supplied through host-level seams and a native entry, not by editing the widget
(see `03`/`05`). The native path does **not** load the plain `conciv-widget.global.js`; the **core
serves a native page** built from `packages/embed/src/native-entry.ts` (same `@conciv/embed` app code,
different entry) and the SDK WebView loads that URL (D1 — sole v1 delivery, same-origin).

All four de-risking spikes passed on 2026-07-23 (iOS 26.5 simulator). This plan turns the spike-grade
hacks into first-class seams. The spike code is quoted verbatim in
[`appendix-a-spike-reference.md`](./appendix-a-spike-reference.md) — it is the only surviving copy, so
treat the appendix as source-of-record for the native mechanics.

## Read order

| File                                                               | What it decides                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`00-overview.md`](./00-overview.md)                               | Goals, the spike verdicts, the hack→seam map, milestone ordering, how the pieces fit. Read first.                                                                                                                                                                                                                  |
| [`01-phase0-grab-contract.md`](./01-phase0-grab-contract.md)       | **Blocks everything.** Host-neutral `@conciv/grab` types; migrate web adapter + testkit fake + the one renderer.                                                                                                                                                                                                   |
| [`02-bridge-protocol.md`](./02-bridge-protocol.md)                 | The zod message schema between page and native, handshake/apiBase handoff, cross-platform JSON conformance fixtures.                                                                                                                                                                                               |
| [`03-ios-extension.md`](./03-ios-extension.md)                     | `packages/extensions/ios` shape (terminal precedent): `ios.build/run/screenshot/logs` tools, the host-level `grabProvider` seam, the **core-served native page** (`native-entry.ts`), optional/inert config, source-context registration. Why tools not raw bash. `ios.viewHierarchy` is cut from M3 (B4).         |
| [`04-native-sdk.md`](./04-native-sdk.md)                           | Swift `ConcivWidget`: **hybrid monorepo-source + mirror-repo distribution** (D2), transparent overlay shell + keyboard/safe-area, origin-pinned/crashed-recovering bridge handler + teardown, **UIKit hit-test + SwiftUI SDK-owned anchor** pick (D5), native FAB, Release-build hygiene, `#if DEBUG` integration. |
| [`05-widget-side.md`](./05-widget-side.md)                         | Widget/app changes: `launcher: 'native'\|'mascot'\|false`, embedded-host open signal, `handle.rebind` (same-core drift), `grabbable` on `GrabApi`, grab source rendering, mobile-width responsive pass, safe-area.                                                                                                 |
| [`06-transport-auth.md`](./06-transport-auth.md)                   | Loopback tiers (sim/emulator/device), stable-port + token pairing (`/t/<token>` = core routing), token lifetime/re-pair, discovery, physical-device QR path.                                                                                                                                                       |
| [`07-testing.md`](./07-testing.md)                                 | Per repo rules: testkit for tools, the simctl boundary problem, decode-equivalence bridge conformance, **required** Swift conformance CI + transcript re-record, the sim-CI-lane decision (deferred), manual verification protocol.                                                                                |
| [`08-release-packaging.md`](./08-release-packaging.md)             | `PUBLIC_PACKAGES` + fallow `publicPackages` additions, changeset, embed native-bundle wiring (D16), the SDK **mirror-repo publish flow** (D2).                                                                                                                                                                     |
| [`09-android-sketch.md`](./09-android-sketch.md)                   | One-page parallel: same tool names over gradle/adb, Compose semantics advantage.                                                                                                                                                                                                                                   |
| [`10-open-questions.md`](./10-open-questions.md)                   | Genuinely undecided items, each with a recommendation.                                                                                                                                                                                                                                                             |
| [`appendix-a-spike-reference.md`](./appendix-a-spike-reference.md) | Load-bearing spike fragments: Swift pick-mode core, bridge handler, overlay transparency recipe, page bridge, build/relaunch scripts, `simctl` env gotcha.                                                                                                                                                         |

## Milestone ordering (no timelines — dependency order)

1. **M0 — Phase 0 grab contract** (`01`). Nothing native can proceed until `Grab` is host-neutral.
2. **M1 — Bridge protocol + fixtures** (`02`). The wire both platforms code against.
3. **M2 — Widget-side seams** (`05`, except the responsive pass which is an independent parallel PR).
4. **M3 — iOS extension server tools** (`03`) — `ios.build/run/screenshot/logs`, drivable from a desktop
   core against a booted sim, before any SDK exists. `ios.viewHierarchy` is **not** in M3 (B4).
5. **M4 — Native SDK** (`04`) — implements the M1 bridge (origin-pinned, ready-gated, queued, crashed-
   recovering), the M2 open signal, the native `grabProvider`, UIKit hit-test + SwiftUI anchor pick, and the
   grab-attached subtree folded into `grab.text`.
6. **M5 — Transport/auth hardening** (`06`) — the public `handle.rebind(apiBase)` API (same-core drift) +
   discovery + token pairing; needed the moment a physical device or a second port appears.
7. **Parallel — mobile responsive PR** (`05`), **release wiring + mirror publish** (`08`), **Android
   sketch** (`09`) as capacity allows.

## Key recommendations (one glance)

- Make `Grab.preview` a **discriminated union** (`dom` | `image`), not a forced image — preserves web
  fidelity with zero rasterization while keeping every value that crosses the native bridge DOM-free.
- **Core-served native page is the sole v1 delivery (D1).** The core serves a native page built from
  `packages/embed/src/native-entry.ts` (a real `src/` file + `vite.native.config.ts`, NOT a test fixture);
  the SDK WebView loads that URL. Page origin == core origin ⇒ same-origin RPC/SSE, one origin to pin, no
  null-`file://` case, **no SDK-bundled host HTML in v1** (deferred, `10` Q7). **Flag:** core serves no HTML
  route today (the `it` plugin is a bundler plugin; Vite serves pages in dev), so this is a **small new core
  route** serving the embed native build — called out honestly in `03`, not pretended existing.
- **Host-level grab seam (B1), single source (D1):** add a neutral `grabProvider` to `ConcivInit`
  (`packages/embed/src/mount.ts:8`), thread it through router context, and let `makePaneGrabApi`
  (`apps/conciv/src/extension/pane-grab.ts:5`) use it — returning `grabbable` so it reaches the composer
  (D9). The native page entry passes `makeNativeGrabProvider()`; the `window.__CONCIV_GRAB_PROVIDER__`
  import-time seam is **deleted** (D1/M-A7). The native pick is a **singleton** over the one transport (D10).
- **apiBase same-origin + same-core rebind (B2/D8):** the served page's own origin is the initial base (no
  `documentStart` injection needed); `handle.rebind(apiBase)` handles **same-core port drift only** (recreates
  the page plane, re-points rpc, re-runs connected effects via a connection-generation signal —
  `mount-impl.tsx:60`/`router.ts:47`), preserving nav/session. A **different core = fresh mount**, not rebind.
- `ios.*` are **first-class extension tools, never raw bash**: `classifyCommand`
  (`packages/core/src/chat/gate.ts:44`) marks `xcodebuild`/`simctl`/`./relaunch.sh` as `ask`; extension
  tools execute server-side via `buildExtensionTools` (`packages/core/src/app.ts:101`), bypassing the gate.
  `ios.screenshot` returns `imageResult()` (`packages/extension/src/image-result.ts:11`). The iOS config is
  **fully optional + inert when absent** (D7) so ordinary `@conciv/it` projects still start
  (`parseConfig(undefined)`, `app.ts:198`).
- **`ios.viewHierarchy` is cut from v1 (B4).** v1 gives the agent screen context via `ios.screenshot` plus a
  bounded **view subtree folded into `grab.text`** (D6 — the only path that reaches the model, verified
  against `chat-pane.tsx:341`). Agent-pulled full-screen hierarchy is deferred (`10` Q3); a typed subtree
  attachment is open (`10` Q12).
- **Swift SDK = hybrid (D2), NOT a monorepo root `Package.swift`.** Source of truth stays in the monorepo
  (`native/swift/ConcivWidget/`, **nested** manifest, no root `Package.swift`, no bare-semver tags) so a PR
  can change bridge schema + Codable + fixtures atomically with an **in-repo diff-gated** fixture copy;
  **distribution is a mirror repo `conciv-dev/conciv-swift`** that release CI publishes (root manifest +
  bare-semver tags). Kills the M-A9 one-way door; the mirror is a disposable artifact.
- **SwiftUI selection = SDK-owned anchors, not a11y-tree traversal (D5).** UIKit uses the spike-proven
  `UIView` hit-test walk; SwiftUI uses a `.concivGrab(id:)` modifier writing geometry into an in-process
  registry the pick overlay hit-tests, capture = render hosting view + crop to anchor frame. Unanchored
  SwiftUI content is **not pickable in v1** (documented honestly). No general accessibility-tree claim.
- **Bridge robustness (D3/D4):** in-band version negotiation (`handshake.hello {minV,maxV}` →
  `bridge.incompatible` visible error), runtime ignores unknown keys (additive tolerance), decode-equivalence
  - roundtrip conformance over a hand-maintained fixture table (no byte-equal, no schema-walker);
    crashed-state recovery (`webViewWebContentProcessDidTerminate` → reload → re-handshake), re-posted
    `bridge.ready`, retried `handshake`, set-state `open`/`close`.
- Native FAB owns open/close; `launcher: 'native' | 'mascot' | false` (D17), a **new settings field**
  (`packages/protocol/src/config-types.ts`) distinct from `modal` (M13): `'native'` (SDK default) suppresses
  the web mascot; `'mascot'` keeps the web mascot as launcher (native shrinks the touch region to the
  reported `mascotRect` when closed); `false` = none.
- **`/t/<token>` is CORE routing, not a proxy (D13 correction).** `packages/core/src/start.ts:93-99` mounts
  the whole app under `/t/<token>` when `accessToken` is set (the try/connect flow proves it), so
  path-prefix token-scoping is zero new code; a header would be the NEW work. Token persists for the core
  process lifetime, regenerates on restart, stale token → 404 → SDK surfaces a re-pair prompt.
- **Defer the macOS+simulator e2e lane, but the Swift conformance job is REQUIRED (D15).** Ship a written
  manual verification protocol first; the cheap `swift test` decode/roundtrip job is **required on PRs**
  touching `packages/extensions/ios` or `native/swift/ConcivWidget/` (removes the TS-required/Swift-optional
  asymmetry). Tool logic is tested hermetically against recorded `simctl` transcripts that carry their Xcode
  version and are re-recorded on major bumps.
- Source context v1: extension registers the **native project root + build scheme**; per-view source
  hints come from the `.concivGrab(id:)` **anchor id** convention the agent greps. SwiftUI exposes no
  runtime source; document the honest options.
