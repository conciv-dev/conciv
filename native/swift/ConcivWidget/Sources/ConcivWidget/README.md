# ConcivWidget

## Overview

The ConcivWidget iOS SDK: overlays a transparent WKWebView that loads the dev core's native page above the host app, finds the core by env, pairing file or port probe, and exchanges versioned JSON bridge messages for open, close and element picks.

## Interface

- `ConcivWidget.attach(launcher:)` (`ConcivWidget.swift`): zero-config attach; resolves the key window, reads `CONCIV_URL`, else runs discovery
- `ConcivWidget.attach(apiBase:token:launcher:)` and windowed `attach(to:...)` overloads (`ConcivWidget.swift`): explicit endpoint or window
- `ConcivWidget.detach()` (`ConcivWidget.swift`)
- `ConcivLauncher` (`LiveRegion.swift`): `.native` FAB or `.mascot`
- `ConcivEndpoint` (`Discovery.swift`): `apiBase`, `token`, `pid`
- `ConcivDiscovery` (`Discovery.swift`): `defaultPort` 4599, `candidatePorts` [4599, 8787, 3000], `parsePairingFile`, `pageURL`, `healthURL`, `isHealthyResponse`, `envApiBase`, `shouldAutoShow`, `defaultPairingFileURL`, `isStaleToken`, `isSameCore`
- `ConcivDiscoverer.discover()` (`Discovery.swift`): pure discovery over injected file reader and probe; `ConcivDiscoveryRuntime` (`DiscoveryRuntime.swift`) supplies the FileManager reader and URLSession `/health` probe
- `ConcivAnchorRegistry.shared` and `View.concivGrab(id:label:)` (`ConcivGrabAnchor.swift`): register SwiftUI frames as pickable anchors
- bridge messages (`BridgeMessages.swift`): `BridgeMessage` enum over `BridgeReady`, `HandshakeHello`, `GrabPick`, `GrabCancel`, `BridgeAck`, `HostPanelToggled`, `HostLog` (page to native) and `Handshake`, `BridgeIncompatible`, `Open`, `Close`, `GrabResult`, `GrabCapability` (native to page)
- `bridgeMinVersion`, `bridgeMaxVersion`, `BridgeNegotiation.negotiatedVersion` (`BridgeMessages.swift`)
- `NeutralGrab`, `ImagePreview`, `ViewNode`, `Source`, `Rect`, `GrabMode`, `GrabResultReason` (`BridgeMessages.swift`)
- `BridgeHandler` (`BridgeHandler.swift`): `WKScriptMessageHandler` named `concivBridge` with acked delivery
- `OverlayController`, `PassthroughContainerView` (`OverlayController.swift`): overlay window content, FAB, re-pair prompt, keyboard handling
- `PickMode.swift`: UIKit hit-test element picking; `Capture.swift`: JPEG preview capture; `LiveRegion` (`LiveRegion.swift`): touch capture region; `ConcivWindowResolver` (`WindowResolver.swift`)

## Invariants

- `ConcivWidget.swift`: outside `#if DEBUG`, `attach` and `detach` are no-ops and `.concivGrab` is inert; ship Release builds to TestFlight and the App Store
- `ConcivWidget.swift`: public entry points are `@MainActor`
- `ConcivWidget.swift:attachGeneration`: a discovery pass that finishes after a newer attach or a detach does nothing
- `Discovery.swift:envApiBase`: `CONCIV_URL` must have a scheme and a host; otherwise discovery runs
- `BridgeMessages.swift:BridgeNegotiation.negotiatedVersion`: ranges that do not overlap return nil and the connection is rejected with `bridge.incompatible`; both bounds are currently 1
- `BridgeHandler.swift`: messages from a non-main frame or another origin are dropped; navigation outside the core origin is cancelled
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
