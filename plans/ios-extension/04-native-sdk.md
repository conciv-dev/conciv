# 04 — Native SDK (Swift `ConcivWidget`)

> **Review fixes (review-01-codex): B5, B2, M6, M7, M9, M12.** SwiftPM is consumed via a **root
> `Package.swift`** at the repo root that exposes the nested sources, tagged with **bare semver** (B5); the
> bridge handler is **main-frame + origin pinned and removed on detach** (M6) and runs the **ready/queue
> state machine** with acks (M7); pick walks the **accessibility tree** so SwiftUI content is selectable,
> with SDK anchor modifiers and real-SwiftUI acceptance tests (M9); fixtures are a **committed copy +
> drift-check**, not a cross-tree resource (M12); and `handle.rebind` re-binds on port change (B2, AC4).
>
> **Review fixes (review-02/03/04): HYBRID monorepo-source + mirror-distribution SDK (D2/M-A9),
> crashed-state recovery (D4/B-A1), SwiftUI = SDK-owned anchors not a11y-tree traversal (D5/B-A3/codex-9),
> keyboard + safe area (D12/M-A8), release-build hygiene (D14/M-A10), transcript re-record protocol
> (D15/M-A13), Codable ignores unknown keys + decode-equivalence not byte-equal (D3/m-A17).** The Swift
> **source of truth stays in the monorepo** at `native/swift/ConcivWidget/` (with `Package.swift` **nested
> there, not at the repo root**, for local dev/tests) so one PR can change the bridge schema + Swift Codable
>
> - fixtures atomically; the fixture drift-check is an **in-repo path copy + git diff gate**. **Distribution
>   is a mirror repo `conciv-dev/conciv-swift`** that release CI publishes to (root `Package.swift` + Sources
> - committed fixtures copy + bare-semver tags, regenerated from the monorepo each release); consumers'
>   `.package(url:)` points **only at the mirror**. The monorepo **never grows a root `Package.swift` and
>   never needs bare-semver tags** — that kills the M-A9 one-way door (the mirror is a disposable artifact)
>   and satisfies B5. Selection is **UIKit hit-test walk (spike-proven) + SwiftUI SDK-owned anchor
>   modifiers** — **no general accessibility-tree traversal**. The bridge adds a **crashed → reload →
>   re-handshake** transition. Keyboard-avoidance/safe-area and a Release-build checklist are specified.

The Swift package a developer drops into their iOS app to get the conciv overlay + native grab. It is the
production form of the spike's `PaymentsViewController` machinery, extracted from the demo screen and
cleaned into a reusable, `#if DEBUG`-gated component.

## Where it lives — HYBRID: monorepo source of truth + mirror repo for distribution (D2 / M-A9)

The earlier plan put a **root `Package.swift` at the monorepo root**. That is the single most-regretted
decision in the whole plan (M-A9): it couples the SDK's public consumption URL to `conciv.git` forever,
changes the repo's identity for Swift-aware tooling, and rots (the required macOS build lane is deferred).
The resolution is a **hybrid** that keeps atomic contract changes AND a clean consumption URL:

- **Source of truth stays IN the monorepo** at `native/swift/ConcivWidget/`, with its `Package.swift`
  **nested there** (`native/swift/ConcivWidget/Package.swift`), **NOT at the repo root**. Local dev/tests
  run `swift test` from that directory. Because the manifest is nested, `.package(url: conciv.git)` cannot
  (and must not) resolve it — that is intentional; consumers use the mirror (below). One PR can change the
  bridge zod schema (`02`), the Swift Codable, and the fixtures **atomically**, and the drift-check is a
  trivial **in-repo path copy + git diff gate** (no cross-repo fetch).
- **The monorepo carries NO root `Package.swift` and needs NO bare-semver tags.** The scoped-npm-tag
  collision question disappears entirely (the earlier "all 285 tags scoped" claim — slightly wrong, two
  non-semver tags exist — is now moot).
- **Distribution is a MIRROR repo `conciv-dev/conciv-swift`** that **release CI publishes to**: a root
  `Package.swift` + `Sources/` + a committed fixtures copy + **bare-semver tags**, all **regenerated from
  the monorepo on each release** (subtree push or a publish script — sketched in `08`). The mirror is a
  **disposable build artifact**, not a second source of truth: nobody edits it by hand. This kills the
  one-way door (the monorepo URL never becomes a public Swift consumption URL; the mirror can be regenerated
  or relocated freely) and satisfies B5 (the mirror's root manifest + bare-semver tags are SwiftPM-consumable).

Consumers add (mirror URL ONLY):

```swift
.package(url: "https://github.com/conciv-dev/conciv-swift.git", from: "1.0.0")
// target dependency:
.product(name: "ConcivWidget", package: "conciv-swift")
```

### Layout (source of truth in the monorepo)

```
native/swift/ConcivWidget/
  Package.swift                     # NESTED manifest (local dev/tests); iOS 17+; NOT at repo root
  Sources/ConcivWidget/
    ConcivWidget.swift              # public entry: ConcivWidget.attach(to:apiBase:token:) / detach
    OverlayController.swift         # transparent WKWebView shell + FAB + hitTest override + keyboard insets
    BridgeHandler.swift             # WKScriptMessageHandler; origin-pinned, ready/queue/crashed state machine
    PickMode.swift                  # UIKit hit-test walk + SwiftUI anchor-registry pick overlay (D5)
    ConcivGrabAnchor.swift          # SwiftUI .concivGrab(id:) modifier + in-process anchor registry (D5)
    Capture.swift                   # render hosting view, crop to anchor/UIView frame → JPEG data-URL (D5)
    BridgeMessages.swift            # Codable structs mirroring bridge.ts (default Codable ignores unknown keys)
  Tests/ConcivWidgetTests/
    BridgeConformanceTests.swift    # decode + roundtrip the COMMITTED fixture copy (D3/M12)
    Fixtures/bridge/*.json          # in-repo committed copy of the canonical fixtures, git-diff-gated (D2)
    PickSelectionTests.swift        # UIKit hit-test + SwiftUI anchor pick/selection tests (D5)
    transcript-xcode-version.txt    # Xcode version a recorded transcript came from (D15)
```

The nested `Package.swift` is an ordinary manifest rooted at `native/swift/ConcivWidget/` (the release
publish step copies this same tree, verbatim, to the mirror repo's root — `08`):

```swift
// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "ConcivWidget",
  platforms: [.iOS(.v17)],
  products: [.library(name: "ConcivWidget", targets: ["ConcivWidget"])],
  targets: [
    .target(name: "ConcivWidget"),
    .testTarget(
      name: "ConcivWidgetTests",
      dependencies: ["ConcivWidget"],
      resources: [.copy("Fixtures/bridge")]           // committed copy, in-repo git-diff-gated (D2)
    ),
  ]
)
```

### Fixtures: committed copy + in-repo drift-check (D2 / M12 / D3)

- The canonical fixtures live at `packages/extensions/ios/fixtures/bridge/` in the monorepo — a
  **hand-maintained example table** (`02` M11, D3).
- A **committed copy** lives at `native/swift/ConcivWidget/Tests/ConcivWidgetTests/Fixtures/bridge/`.
- A single deterministic command copies canonical → committed (e.g. `pnpm --filter @conciv/extension-ios
gen:fixtures`, which writes the canonical dir and copies into the Swift test tree); CI runs it and asserts
  `git diff --exit-code` — an **in-repo path copy + diff gate**, no cross-repo fetch. Because both trees are
  in one repo, a bridge change and its fixture sync land in the same PR. The Swift tests do **decode +
  roundtrip** (decode-equivalence, not byte-equal, D3). The mirror inherits the already-synced committed
  copy at publish time (`08`).

## Public API (what an app author writes)

Keep it a two-call surface, `#if DEBUG` so it never ships in a release build:

```swift
#if DEBUG
import ConcivWidget

// in SceneDelegate.scene(_:willConnectTo:) or a SwiftUI .onAppear
ConcivWidget.attach(
    to: window,                              // or the root UIViewController's view
    apiBase: URL(string: "http://127.0.0.1:4599")!,  // core-served native page origin; or nil for discovery (06)
    token: nil                               // pairing token when non-loopback (06)
)
#endif
```

`attach` loads the **core-served native page** (`apiBase` + the native-page route, `03`/D1) into the
transparent WebView, and installs the FAB + overlay above the app's own view hierarchy without the app
restructuring its screens. Internally it hosts an `OverlayController` on a passthrough window/overlay view.
There is **no SDK-bundled host HTML in v1** — the WebView always loads the core URL (D1).

## The four cleaned mechanisms (from the spike)

The appendix carries the exact spike Swift. The SDK generalizes it off the hardcoded `PaymentsViewController`.

### 1. Transparent overlay shell (`OverlayController`)

The proven recipe (appendix, spike `toggleOverlay`):

```swift
web.isOpaque = false
web.backgroundColor = .clear
web.scrollView.backgroundColor = .clear
web.scrollView.isOpaque = false
if #available(iOS 16.4, *) { web.isInspectable = true }   // Safari devtools attach in DEBUG
```

The core-served native page keeps its `html,body` transparent (native entry's host document, `03`/appendix
A.5); the widget mounts into a shadow root and the page stays see-through.

**hitTest override (the new work — fixes touch pass-through).** The spike WebView covered the screen and
ate all touches. The SDK's overlay `hitTest(_:with:)` must return `nil` for points **outside** the live
region so those touches fall through to the native UI, and the widget's own view for points inside. The
live region depends on `launcher` (D17) and panel state, reported via `host.panelToggled`:

- `launcher: 'native'` (SDK default) + panel **closed** → only the **native FAB** is hit-testable; the rest
  of the overlay passes through.
- `launcher: 'mascot'` + panel **closed** → native shrinks the WebView interaction region to the reported
  `mascotRect` (from `host.panelToggled`, `02`/D17) so only the web mascot captures touches; the rest passes
  through.
- panel **open** → the full panel rectangle captures touches (modal-when-open, `10` Q5); the rest still
  falls through (or a scrim).

Implement by tracking a `panelOpen` flag + the current live rect (FAB rect, `mascotRect`, or panel rect).

### 1b. Keyboard avoidance + safe area in a transparent full-screen WebView (D12 / M-A8 / m-A16)

A transparent full-screen `WKWebView` overlay is the classic spot where the software keyboard covers the
composer and safe-area insets are wrong — the first thing a user hits typing on a device. Concrete v1
scope:

- **Keyboard avoidance.** `WKWebView` does not automatically inset web content for the keyboard when it is
  an overlay. The SDK observes `keyboardWillShow/Hide` (or `keyboardLayoutGuide` on iOS 15+) and adjusts the
  overlay/panel bottom inset so the composer stays above the keyboard. Decide whether to let the WebView's
  own `scrollView.contentInset` handle it or to resize the panel container; document the chosen strategy.
- **Input accessory.** Suppress or own the default `inputAccessoryView` (the gray bar above the keyboard)
  so it does not clash with the transparent overlay; a `nil` accessory is usually right for a chat composer.
- **Safe area (m-A16).** The core-served page sets `viewport-fit=cover` (appendix A.5), so the full-bleed
  mobile sheet (`05` §5) must pad with `env(safe-area-inset-*)` — the page-side obligation is in `05` §5;
  the SDK side ensures the WebView actually extends under the safe areas (edge-to-edge) so those insets are
  meaningful.
- **Testing.** These are device/simulator-visible behaviors; verify on a real device in the manual protocol
  (`07`) — keyboard insets do not reproduce in headless browser tests.

### 2. Bridge handler (`BridgeHandler`) — pinned, gated, torn down, crash-recovering (M6, M7, D4)

Register the one handler (spike `configuration.userContentController.add(self, name: "concivBridge")`) and
decode incoming JSON into `BridgeMessage` Codable enums. On **every** `didReceive` (M6):

- reject unless `message.frameInfo.isMainFrame`;
- reject unless the committed origin (`message.frameInfo.securityOrigin` / `webView.url` origin) equals the
  pinned **core origin**. Under D1 the page is core-served, so the pinned origin **is** the `apiBase` origin
  — one loopback origin, no null-`file://` bundled-host case (M-A12 dissolves);
- through a `WKNavigationDelegate`, cancel navigations to any non-pinned origin (no redirect off the
  trusted page);
- remove the handler on `detach` (`userContentController.removeScriptMessageHandler(forName: "concivBridge")`)
  and re-add on re-attach, so a reused WebView never carries a stale handler.

A message failing any check is dropped and logged, never acted on.

**Native→Page delivery runs the readiness/queue/crashed state machine (M7, D4).** Do not call
`evaluateJavaScript("window.__concivNative.<method>(...)")` blindly. This is the platform-neutral machine
from `02` (D11) with the WebKit transport; the states and rules are canonical in `02`:

- Track `loading → ready → loading (on nav/reload) → torn-down`, plus **`crashed`** (D4/B-A1). Start in
  `loading`.
- Enqueue all outbound calls while `loading`; flush in order on `bridge.ready` (the page re-posts
  `bridge.ready` until its first acked call, so a lost first `ready` cannot deadlock — M-A4).
- Tag each dispatched call with a monotonic `seq`; hold it unacked until the page posts `bridge.ack {seq}`.
  **`handshake` and any rebind-carrying message are retried-until-acked and re-sent on every transition to
  `ready`** (M-A5); superseded non-idempotent calls are dropped after a bounded retry.
- On navigation start / reload, return to `loading`, discard superseded calls, keep state that must be
  re-sent (latest handshake base, latest `grabCapability`).
- **`webViewWebContentProcessDidTerminate` (WKNavigationDelegate) → `crashed`** → the SDK **reloads the
  WebView** (a killed content process leaves a blank overlay). The reload drives a fresh
  `bridge.ready`/`handshake.hello`/`handshake` cycle; **any pending pick resolves `null` and the pick
  overlay exits.** This is the dominant real failure mode for a long-lived transparent overlay and MUST be
  handled, not left to a blank view.
- `open`/`close` are **set-state** (ensure-open/ensure-closed, D4) so re-dispatch after any transition is
  safe.

Deliver by JSON-encoding with `JSONEncoder` and calling the method. **Codable ignores unknown keys by
default** (no custom `init(from:)` needed) — additive fields within a version decode fine (D3); version
skew is handled by the `handshake.hello {minV,maxV}` negotiation and `bridge.incompatible` (`02`), not by
rejecting unknown keys. The Codable structs are tested by **decode + roundtrip** against the committed
fixture copy (decode-equivalence, not byte-equal — D3).

### 3. Pick mode (`PickMode` + `Capture`) — UIKit hit-test + SwiftUI SDK-owned anchors (D5 / B-A3)

The spike's raw `UIView` walk is correct for UIKit. **It is wrong for SwiftUI**, and — critically — SwiftUI
does **not** expose a publicly-enumerable in-process semantic/accessibility tree the SDK can walk (a
hosting view may expose no recursively-enumerable semantic descendants even though Accessibility Inspector
and XCUITest see them, out of process). The earlier "walk the accessibility tree" claim (M9) is **wrong**
and is dropped (codex-9/B-A3). The v1 contract has two clearly-scoped mechanisms and **no general
accessibility-tree traversal anywhere**:

**UIKit = the `UIView` hit-test walk (spike-proven).**

- `PickOverlayView` — `touchesBegan/Moved/Ended` → `onMove`/`onSelect` callbacks (unchanged from spike).
- Selection = the deepest "interesting" `UIView` under the point (spike `search`/`isInteresting`), excluding
  the SDK overlay/FAB.
- **Text** from `collectTexts` (UILabel/UITextField); **rect** from `frameInWindow`; **class/a11yId/label**
  for `source`.
- **Capture** = `renderView` (`drawHierarchy`, scale 2, JPEG 0.6) of the picked view region, cropped to its
  frame.

**SwiftUI = SDK-owned anchor modifiers (the supported v1 contract).**

- Ship `.concivGrab(id:)` — a SwiftUI modifier that writes the view's **geometry** (via `GeometryReader` /
  anchor preferences) plus its `id` and any label into an **in-process anchor registry** the SDK owns.
- The pick overlay **hit-tests the anchor registry** (not an accessibility tree): the anchor whose frame
  contains the touch point is the selection. `id` becomes the `a11yId`/`source` the agent greps for.
- **Capture** = render the **hosting view** (the SwiftUI `UIHostingController`/host view) and **crop to the
  anchor frame** — the anchor gives a real rect even though the SwiftUI element has no backing `UIView`.
- **Unanchored SwiftUI content is NOT pickable in v1** (documented honestly, AC3). Authors tag the views
  they want grabbable with `.concivGrab(id:)`; this is the SwiftUI analog of `data-conciv-source`.

**Common:**

- **Grab-attached subtree (B4).** From the picked node (UIView subtree, or the anchor registry's nested
  anchors under the picked anchor) build a **bounded** `ViewNode[]` (depth + node cap, `02`) and — per D6 —
  **fold it into `grab.text`** so it reaches the model; also keep it on `NeutralGrab.subtree` for the SDK.
- Assemble a `NeutralGrab` (`02`) and deliver `grabResult` (guarded by `requestId`, M8; singleton, D10).
- **App backgrounding mid-pick (m-A18).** `drawHierarchy(afterScreenUpdates: true)` can capture blank/stale
  if the app backgrounds during capture. Guard: if the app is not active at capture time, resolve the pick
  `null` and exit the overlay rather than delivering a blank preview.

**Acceptance (AC3, rewritten):** `PickSelectionTests` cover **UIKit** (the hit-test walk returns the
interesting view + text + rect) **and a real SwiftUI screen using `.concivGrab(id:)`** (picking an anchored
row returns the anchor's `id`, its label text, and the crop-to-anchor frame). There is **no** assertion of
picking unanchored SwiftUI content — that is explicitly out of v1.

### 4. Native FAB + open/close

Replace the spike's demo FAB with an SDK-owned one (spike `configureFab`/`fabTapped`). Tapping it does
**not** toggle a WebView `isHidden` anymore; it drives the widget:

- FAB tap → `window.__concivNative.open()` / `close()` — **set-state** (ensure-open/ensure-closed, D4), so
  the widget owns panel visibility (`05`) and re-dispatch is idempotent.
- The WebView stays present and transparent; only the widget's panel animates in/out. With `launcher:
'native'` (SDK default, D17) the web mascot is suppressed so only the native FAB shows; with `launcher:
'mascot'` the web mascot is the launcher instead (no native FAB) and native shrinks the touch region to
  `mascotRect` when closed.

## Dev-only integration & build

- Everything is `#if DEBUG`. `attach` is a no-op in release. `isInspectable = true` is compiled **under
  `#if DEBUG`** (D14) so it never ships in a release binary.
- The SDK does not require a `.xcodeproj`; it is SwiftPM. The demo/e2e app can still use the spike's
  `swiftc` fast path (appendix `build.sh`, ~3-4s) for the extension's own manual verification, driven by
  `ios.build`/`ios.run` (`03`).
- iOS 17+ deployment target (spike used 17.0; the widget itself ran on 26.5 sim).

### Release-build hygiene checklist (D14 / M-A10)

`#if DEBUG` guards SDK **code**, but it does **not** strip **Info.plist keys** from a Release build — those
are App Store review surface and must be Debug-only by configuration, not by hope:

- **ATS exception** (`NSAppTransportSecurity` → `NSAllowsLocalNetworking`) and
  **`NSLocalNetworkUsageDescription`** go in a **Debug-only** `xcconfig`/per-config `Info.plist` (use
  build-configuration-conditional `Info.plist` keys, or a Debug-only `.xcconfig` that injects them), so a
  Release/App Store build carries neither. `NSAllowsLocalNetworking` alone suffices for loopback; never ship
  `NSAllowsArbitraryLoads` (the spike used it for convenience — not required, verdict #1).
- **`isInspectable`** is compiled under `#if DEBUG` (above). Beware a **Debug-configured TestFlight** build:
  it would carry the dev-core URL and inspectability; document that internal TestFlight builds of a
  conciv-integrated app must use a Release configuration (or a dedicated non-conciv configuration).
- The SDK README ships this checklist so a consumer does not accidentally submit an app with a dev ATS
  exception or an inspectable WebView.

## Acceptance criteria

- **AC1** — `swift build` + `swift test` pass from the **nested monorepo manifest**
  (`native/swift/ConcivWidget/`, D2) on macOS with Xcode; `BridgeConformanceTests` **decode + roundtrip**
  every valid + unknown-key fixture from the **committed copy** and reject every `invalid/` one; the in-repo
  fixture copy + `git diff --exit-code` gate is clean (D3/D2), and the release publish step reproduces the
  same tree into the `conciv-swift` mirror (`08`).
- **AC2** — In a demo app, `ConcivWidget.attach` shows the FAB over real native screens; tapping opens the
  transparent overlay with the widget panel floating above UIKit; the rest of the screen remains
  touchable (hitTest passthrough verified by tapping a native control while the panel is closed). Keyboard
  raises without covering the composer; safe-area insets are respected (D12).
- **AC3** — Native pick (D5): **UIKit** hit-test returns the interesting view + text + rect; **a real
  SwiftUI screen using `.concivGrab(id:)`** returns the anchor's `id`, label text, and crop-to-anchor frame;
  the `NeutralGrab` `preview.dataUrl` renders in the composer and the bounded subtree is folded into
  `grab.text` (D6). Unanchored SwiftUI content is **not** pickable (v1, documented) and is not asserted.
- **AC4** — Same-core port drift (D8): a `handshake` carrying a new `apiBase` for the **same core** triggers
  `handle.rebind`, which recreates the page plane, re-points the rpc link, clears the query cache, and
  re-runs connected effects via a connection-generation signal — no relaunch (validates `02`/`05` §2b/`06`).
  A different core = fresh mount, not rebind.
- **AC5** — Bridge safety + recovery: messages from a non-main frame or non-core-origin are dropped; the
  handler is removed on detach; Native→Page calls are queued until `bridge.ready` (re-posted until acked)
  and acked; `handshake` is retried until acked; `webViewWebContentProcessDidTerminate` reloads → fresh
  handshake with pending pick → null; `open`/`close` are set-state (M6/M7/M-A4/M-A5/B-A1/D4).
- **AC6** — Zero SDK code paths, `isInspectable`, or Debug ATS/`NSLocalNetworkUsageDescription` plist keys
  compile into a Release build (`#if DEBUG` code audit + per-config plist audit, D14).
