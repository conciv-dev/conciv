# ConcivWidget

## Overview

The ConcivWidget iOS SDK: overlays a transparent WKWebView that loads the dev engine's native page above the host app, finds the engine by env, pairing file or port probe, and exchanges versioned JSON bridge messages for open, close and element picks.

## Invariants

- `ConcivWidget.swift`: outside `#if DEBUG`, `attach` and `detach` are no-ops and `.concivGrab` is inert; ship Release builds to TestFlight and the App Store
- `ConcivWidget.swift`: public entry points are `@MainActor`
- `ConcivWidget.swift:attachGeneration`: a discovery pass that finishes after a newer attach or a detach does nothing
- `Discovery.swift:envApiBase`: `CONCIV_URL` must have a scheme and a host; otherwise discovery runs
- `BridgeMessages.swift:BridgeNegotiation.negotiatedVersion`: ranges that do not overlap return nil and the connection is rejected with `bridge.incompatible`; both bounds are currently 1
- `BridgeHandler.swift`: messages from a non-main frame or another origin are dropped; navigation outside the engine origin is cancelled
- `BridgeHandler.swift`: unacked calls are retried at most `maxAckRetries` (2) times after a 1 s `ackTimeout`; calls from a superseded epoch are dropped
- `Capture.swift:jpegDataUrl`: previews over `maxDataUrlBytes` (2 MiB) fail the pick instead of sending a blank preview
- `PickMode.swift`: subtrees are limited to depth 3 (`subtreeMaxDepth`) and 40 nodes (`subtreeMaxNodes`)
- `LiveRegion.swift:LiveRegion`: when open the whole panel captures touches; when closed only the launcher (and re-pair banner) does

## Side Effects

- `OverlayController.swift`: adds a container with a `WKWebView` to the host window and loads `<apiBase>/native`
- `DiscoveryRuntime.swift`: reads the pairing file `~/.conciv/dev-endpoint.json` (or under `SIMULATOR_HOST_HOME`) and probes `/health` with `URLSession`
- `Discovery.swift`: reads `CONCIV_URL`, `CONCIV_AUTOSHOW` and `SIMULATOR_HOST_HOME` from the process environment
- `BridgeHandler.swift`: `evaluateJavaScript` to deliver messages and `webView.reload()` on recovery
- `OverlayController.swift`: keyboard notifications observer and discovery retry with exponential backoff

## Verification

- Run: `cd native/swift/ConcivWidget && swift test` (macOS host; runs the Foundation-only suites)
- Run: `cd native/swift/ConcivWidget && xcodebuild test -scheme ConcivWidget -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (UIKit suites behind `canImport(UIKit)`)
