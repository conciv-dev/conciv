# Spec review 04 — opus, architecture & platform lens (2026-07-24)

Verdict: structurally wrong for the survive-over-time bar; seam-level redesign from review-01 largely sound. Three must-change items: content-process-termination recovery + version negotiation (B-A1, B-A2), SwiftUI capture matching its own selection mechanism (B-A3), SDK delivery decoupled from the monorepo root URL (M-A9).

## BLOCKER

- **B-A1** Bridge state machine omits WKWebView content-process termination (`webViewWebContentProcessDidTerminate`): no crashed→reload→re-handshake transition; pending picks leak; blank view. The dominant real failure mode for a long-lived transparent overlay.
- **B-A2** `.strict()` schemas + single-integer BRIDGE_VERSION + independent SDK/npm cadences = silent brick on version skew. Adding an optional field requires a version bump; a bump makes the peer ignore messages. Needs in-band version negotiation (hello carries supported range) OR additive tolerance (ignore unknown keys); the plan chose two mutually exclusive properties.
- **B-A3** (defective M9 fix) Selection returns accessibility elements (not UIViews); capture keeps UIView-shaped `renderView`/`drawHierarchy`. SwiftUI a11y elements have no backing UIView/bounds. Must render hosting view cropped to `accessibilityFrame`, or use SDK-owned anchors; 04 AC3 unmeetable as written.

## MAJOR

- **M-A4** `bridge.ready` has no ack: if native misses it, permanent deadlock (native's handshake reply is itself queued behind the lost ready). Needs re-post-until-first-N→P-call or explicit ready-ack.
- **M-A5** `handshake` (carries rebind base) rides the generic 1s-timeout-then-drop ack machine → dropped rebind strands widget on dead core. Critical control messages need retry-until-acked / re-send on state transition.
- **M-A6** Single global grabProvider under per-pane `makePaneGrabApi` construction: multiple panes silently supersede each other's picks; native transport is a singleton and the seam doesn't model it.
- **M-A7** Two provider seams (init.grabProvider vs window global registered at import time) = import-order race on the core-served page; side-effect + `sideEffects` flag unpinned (overlaps feasibility #3).
- **M-A8** Keyboard insets/input-accessory in transparent full-screen WKWebView unaddressed — the classic WKWebView overlay pain; first thing a user hits typing on device.
- **M-A9** Root `Package.swift` = one-way door: couples SDK's public consumption URL to conciv.git forever, unbuilt in required CI (macOS lane deferred) so it rots, changes repo identity for Swift-aware tooling. Drift argument for monorepo already neutralized by the generated-fixtures+committed-copy+diff gate, which works across repos.
- **M-A10** `#if DEBUG` doesn't strip consumer Info.plist entries (ATS exception, NSLocalNetworkUsageDescription) from Release builds — App Store review surface; `isInspectable` + dev-core URL risky in Debug-configured TestFlight.
- **M-A11** Token lifetime/rotation/multi-device identity undefined; core restart = stale token, silent 401, no re-pair path; no clientId on the bridge → two devices cross-fire (recorder clientId lesson not applied).
- **M-A12** Origin pinning degrades to null-origin (file://) in the bundled-host device path — weakest exactly where needed; CORS/SSE for non-loopback or null origins unspecified.
- **M-A13** Recorded simctl transcripts rot green (Xcode-version-specific output, never re-recorded) while the optional macOS conformance job rots red; the cross-language contract guarantee is asymmetric — required TS-side, best-effort Swift-side.
- **M-A14** Bridge client state machine (ready/queue/seq/ack/supersede) is platform-neutral logic trapped in the iOS-named package; Android transport differs (strings via @JavascriptInterface) but the machine is shared — extract to a shared bridge-client in M1 or Android duplicates it.
- **M-A15** (defective B2 fix) rebind disposal omits navigation storage (`makeNavigationStorage` baked into router history pre-plane); core A nav state survives rebind to core B. AC tests core-swapping but the only stated trigger is same-core port drift — scope conflated.

## MINOR

- **m-A16** Safe-area insets (`env(safe-area-inset-*)`) unstated for the full-bleed sheet under viewport-fit=cover.
- **m-A17** Byte-equal golden encode across three serializers (zod/Codable/kotlinx) over-specified vs decode-equivalence + canonicalizer.
- **m-A18** App backgrounding mid-pick: `drawHierarchy(afterScreenUpdates:true)` can capture blank/stale; overlay left inconsistent.
- **m-A19** `grabbable?()` on GrabActions + single grabProvider field foreshadows a bag of xProvider fields; decide the host-capability shape deliberately before Android copies it.

## Most-regretted-in-6-months decision

Root `Package.swift` at the monorepo root (M-A9) — the only genuinely one-way door.
