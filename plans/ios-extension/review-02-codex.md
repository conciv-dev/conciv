# Spec review 02 — codex gpt-5.6-sol second pass (2026-07-24)

Verdict: needs redesign. Original findings: 10 RESOLVED / 2 PARTIAL (2,3) / 1 DODGED (9). NEW: 4 BLOCKER, 4 MAJOR, 1 MINOR.

## Original findings

| #   | Severity | Verdict  | Reason                                                                                                                                                                                |
| --- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BLOCKER  | RESOLVED | `ConcivInit.grabProvider` is threaded through router context into both `makePaneGrabApi` call sites, providing a viable host-level replacement seam.                                  |
| 2   | BLOCKER  | PARTIAL  | Initial pre-mount `apiBase` is fixed, but the proposed rebind only swaps RPC URL/restarts the page plane; it does not recreate app data or retrigger `connected()`-dependent effects. |
| 3   | BLOCKER  | PARTIAL  | A distinct native entry now includes the client, but the SwiftPM package has no resource path for the generated native JS/HTML, so a source-control consumer cannot load it.          |
| 4   | BLOCKER  | RESOLVED | The nonexistent `simctl` fallback and unimplemented RPC tool were removed from v1 and M3.                                                                                             |
| 5   | BLOCKER  | RESOLVED | A repository-root `Package.swift` with explicit target paths and bare-semver tags is SwiftPM-consumable.                                                                              |
| 6   | MAJOR    | RESOLVED | Main-frame checks, committed-origin validation, navigation restrictions, and handler teardown are now required.                                                                       |
| 7   | MAJOR    | RESOLVED | The ready/loading/torn-down state machine, outbound queue, sequence acknowledgements, retry, and reload handling cover the delivery race.                                             |
| 8   | MAJOR    | RESOLVED | Supersession, request-ID guarding, timeout, cancellation, duplicate/late-result handling, and teardown are specified.                                                                 |
| 9   | MAJOR    | DODGED   | Replacing the `UIView` walk with an asserted in-process “accessibility-tree walk” does not establish a public, traversable SwiftUI accessibility hierarchy.                           |
| 10  | MAJOR    | RESOLVED | `ios.screenshot` now returns `imageResult('image/png', …)` rather than embedding PNG data in JSON text.                                                                               |
| 11  | MAJOR    | PARTIAL  | Generated examples plus golden encoding still cannot prove schema equivalence; Swift may accept/add optional fields not represented by the Zod-generated fixtures and still pass.     |
| 12  | MAJOR    | RESOLVED | Fixtures now live inside the Swift test target, with a deterministic copy command and CI drift check.                                                                                 |
| 13  | MINOR    | RESOLVED | `launcher:false` is consistently defined as a separate setting and is no longer equated with `modal:false`.                                                                           |
| 14  | MINOR    | RESOLVED | The fallow list is correctly treated as selective, with audit/trace deciding whether iOS needs an entry.                                                                              |

## New findings

### BLOCKER — Globally registering the iOS server extension breaks projects without iOS configuration

[03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:47) requires adding the iOS server to `packages/it/src/plugin-instance.ts`, while its schema requires `projectRoot` and `bundleId` at [03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:91).

Core unconditionally parses every registered extension’s configuration during startup at [app.ts](/Users/omrikatz/Public/web/aidx/packages/core/src/app.ts:193). `parseConfig(undefined)` becomes `{}`, which fails those required fields. Every ordinary `@conciv/it` project without an `ios` config would therefore fail to start.

Make the entire iOS config optional and mount an inert server when absent, or conditionally register the server extension only for configured native projects.

### BLOCKER — The grab-attached subtree never reaches the agent

[02-bridge-protocol.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:137) explicitly keeps `subtree` outside `@conciv/grab`’s `Grab`, while [03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:128) claims it flows through existing grab staging.

The actual pane store accepts only `Grab` at [pane-context.ts](/Users/omrikatz/Public/web/aidx/apps/conciv/src/app/pane-context.ts:6), and sending/persisting reduces grabs to `grab.text` at [chat-pane.tsx](/Users/omrikatz/Public/web/aidx/apps/conciv/src/chat/chat-pane.tsx:341). No extension storage, attachment, content part, RPC, or prompt serialization is specified for `subtree`. Consequently, the agent receives neither the proposed structured replacement nor the preview image; manual verification step 6 cannot pass.

Put the bounded subtree into a defined model-visible content representation—most simply formatted grab text or a typed attachment/content part—and test the exact chat payload observed by the agent.

### BLOCKER — The proposed SwiftUI accessibility picker relies on a hierarchy the SDK cannot generally traverse

[04-native-sdk.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:175) assumes the SDK can walk from the key window through `accessibilityElements` to SwiftUI semantic descendants.

SwiftUI’s accessibility representation exposed to system accessibility/XCTest is not generally available as a complete public in-process `UIView`/`UIAccessibilityElement` tree. A hosting view may expose no recursively enumerable semantic descendants even though Accessibility Inspector and XCUITest see them. The proposed “real SwiftUI” test does not create the missing production API.

Use explicit SDK-owned anchors/geometry as the supported SwiftUI v1 contract, retain the `UIView` route for UIKit, or move semantic inspection to an XCUITest/out-of-process accessibility channel.

### BLOCKER — The native bundle is not shipped to SwiftPM consumers

[03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:29) builds `conciv-widget-native.global.js` under `@conciv/embed`, and says the SDK loads bundled host HTML. But the root manifest sketch at [04-native-sdk.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:63) declares no production resources—only test fixtures.

A SwiftPM checkout does not run pnpm/Vite, and embed `dist` is not part of the Swift target. The SDK therefore has no native bundle or host HTML to load. Define a committed/generated resource location inside the Swift target, add it to `Package.swift`, and wire bundle generation plus drift verification into release CI. Alternatively, make the core-served page the sole supported v1 delivery model and remove bundled-host claims.

### MAJOR — `handle.rebind` does not implement the lifecycle it promises

[05-widget-side.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/05-widget-side.md:138) proposes mutating the RPC link, restarting `startPagePlane`, and clearing the query cache while preserving the router.

The current router constructs `AppData` once from its RPC client at [router.ts](/Users/omrikatz/Public/web/aidx/apps/conciv/src/router.ts:47), while normal boot supplies `connected: () => true` at [mount-impl.tsx](/Users/omrikatz/Public/web/aidx/packages/embed/src/mount-impl.tsx:60). Reassigning a URL does not change the connected signal, so connected effects do not rerun as claimed. Active chat streams and state tied to old-core session IDs are also outside `startPagePlane`, whose scope is only page-query pumping at [index.ts](/Users/omrikatz/Public/web/aidx/packages/page/src/index.ts:49).

Either fully tear down and reboot the router while explicitly restoring safe UI state, or design a reactive connection generation that every RPC stream/query consumer observes and test active-chat and session-ID transitions.

### MAJOR — The native bundle dependency/build wiring is incomplete

The native bootstrap statically imports `@conciv/extension-ios/client`, but [08-release-packaging.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/08-release-packaging.md:44) never adds that package to `@conciv/embed`’s dependencies/devDependencies or defines how the native artifact enters `files`.

Under pnpm’s dependency isolation, a workspace package must declare what its Vite configuration imports. Add the dependency, native build command, artifact name, package-file policy, and a build test verifying that the client and one shared Solid/Ark runtime are present.

### MAJOR — `grabbable` is dropped by the specified adapter

[05-widget-side.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/05-widget-side.md:20) adds `grabbable` to `GrabActions`, but the proposed `makePaneGrabApi` at [05-widget-side.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/05-widget-side.md:51) returns a `GrabApi` without that member. Later, [05-widget-side.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/05-widget-side.md:175) says the composer reads it from the grab capability surface.

As written, `grabCapability` updates a value that is erased before reaching the composer. Extend `GrabApi` itself, introduce a separate router/host capability accessor, or explicitly return an extended API type and thread it through `HostWiring`.

### MAJOR — The fixture strategy still overstates equivalence

A generator can enumerate known variants and optional-field combinations from the Zod side, but it cannot detect Swift-only optional fields or broader Swift acceptance. Swift could add `foo: String?`, decode every fixture, omit `nil` during encoding, and pass every proposed test.

Use generated Swift declarations from a canonical schema, or downgrade the guarantee to fixture compatibility and add explicit schema-signature comparison. The current “silent divergence surfaces” acceptance claim is false.

### MINOR — Existing-tag verification is factually wrong

[04-native-sdk.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:25) and [08-release-packaging.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/08-release-packaging.md:64) say all 285 existing tags are scoped npm tags. The repository has 285 tags, but also contains `prerebase-widget-reload-continuity` and `slop-archive`.

Neither is semantic-version-shaped, so bare `1.0.0` is currently collision-free, but the asserted verification must be corrected to “no existing bare semantic-version tags,” with a release guard preventing duplicate bare-semver tags.

## Final verdict

**Needs redesign.**

The host grab seam and pre-mount base direction are sound, but the shipped-bundle path, SwiftUI selection mechanism, model-visible subtree transport, and rebind lifecycle remain load-bearing gaps.
