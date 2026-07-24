# Spec review 01 — codex gpt-5.6-sol (2026-07-24)

Verdict: needs redesign (integration seams). 5 BLOCKER / 7 MAJOR / 2 MINOR.

## BLOCKER

### 1. The extension client cannot replace the widget’s `GrabApi`

[03-ios-extension.md, “Client half”](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:116) says `.client()` will merge a native `GrabApi` into host wiring. That is not how extensions compose.

- `.client()` returns only an extension-local `value` ([define-extension.ts](/Users/omrikatz/Public/web/aidx/packages/extension/src/define-extension.ts:64)).
- Mounted extensions receive that value under the `value` key, not as arbitrary host wiring ([mount-extension.tsx](/Users/omrikatz/Public/web/aidx/packages/extension/src/mount-extension.tsx:12)).
- The chat pane always constructs `paneGrab` from the web `@conciv/page` adapter and provides it as the nearest `grab` context ([pane-grab.ts](/Users/omrikatz/Public/web/aidx/apps/conciv/src/extension/pane-grab.ts:5), [chat-pane.tsx](/Users/omrikatz/Public/web/aidx/apps/conciv/src/chat/chat-pane.tsx:373)).

Consequently, the main composer’s grab button will continue activating `react-grab`; the iOS client cannot intercept or replace it through the planned API. Phase 0 does not unblock native grabbing by itself. The plan needs an actual host-level grab injection seam, probably on `ConcivInit`/router configuration or through a capability-provider registry resolved before `makePaneGrabApi`.

### 2. The handshake occurs after the RPC client has already been permanently selected

[02-bridge-protocol.md, “handshake/apiBase handoff”](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:85) and [03-ios-extension.md, client responsibility 3](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:127) propose mounting first, then setting `window.__CONCIV_API_BASE__` from `handshake`.

The embed reads the base once during boot ([mount-impl.tsx](/Users/omrikatz/Public/web/aidx/packages/embed/src/mount-impl.tsx:123)):

- With a base, `bootNormal` creates a fixed RPC client and captures the string in router context ([mount-impl.tsx](/Users/omrikatz/Public/web/aidx/packages/embed/src/mount-impl.tsx:47)).
- Without a base and without a `connectGate`, it still calls `bootNormal` with an empty base ([mount-impl.tsx](/Users/omrikatz/Public/web/aidx/packages/embed/src/mount-impl.tsx:127)).
- Merely changing the global later neither replaces that RPC client nor starts the deferred binding path.
- The only rebinding implementation is private to `bootConnect` through `bindApiBase` ([mount-impl.tsx](/Users/omrikatz/Public/web/aidx/packages/embed/src/mount-impl.tsx:85)).

Thus the normal planned handshake cannot establish the initial connection, and [04-native-sdk.md AC4](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:146) cannot rebind after a port change. `apiBase` must be supplied before `mountImpl` selects a boot path, or embed needs a public deferred/rebind API whose lifecycle also disposes the previous page plane and storage.

### 3. The same “unmodified” global widget bundle does not contain the iOS client

[00-overview.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/00-overview.md:8) promises the unmodified `packages/embed/dist/conciv-widget.global.js`, while [03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:116) depends on `@conciv/extension-ios/client` installing the native bridge.

The global bundle entry statically includes only terminal and recorder ([global-entry.ts](/Users/omrikatz/Public/web/aidx/packages/embed/test/fixtures/global-entry.ts:1)); it has no runtime extension-loading mechanism. Built-in client extensions are normally compiled into a generated module from explicit `clientEntries` ([extensions.ts](/Users/omrikatz/Public/web/aidx/packages/extension-compiler/src/extensions.ts:20), [plugin-instance.ts](/Users/omrikatz/Public/web/aidx/packages/it/src/plugin-instance.ts:7)).

The plan must choose one concrete delivery model:

- Produce a distinct native bundle containing the iOS client.
- Load a separate ESM client from the host page and pass it to `createConciv`.
- Add runtime extension registration before mount.

As written, `window.__concivNative`, native grabbing, handshake handling, and capability messages will never be installed.

### 4. `ios.viewHierarchy` has neither a viable fallback nor an end-to-end bridge

[03-ios-extension.md, tool inventory](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:71) recommends implementing a `simctl` accessibility dump first. `xcrun simctl ui` controls UI preferences; it does not expose an application accessibility/view hierarchy. There is no public `simctl` command matching the proposed fallback.

The accurate SDK route is also incomplete:

- `host.dumpHierarchy` is absent from the supposedly complete protocol in [02-bridge-protocol.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:37).
- No response message, request ID, timeout, cancellation, or error shape is defined.
- Server tools execute in the core process ([app.ts](/Users/omrikatz/Public/web/aidx/packages/core/src/app.ts:101)), while the native bridge exists in the WebView process. The plan defines no server→client transport that could carry the tool request to that WebView and return the native result.

This tool cannot satisfy M3 or its acceptance criteria. It needs either a supported external inspection mechanism such as an XCTest/XCUITest accessibility channel, or a designed server↔WebView↔native request/response route.

### 5. The proposed SwiftPM repository and tag layout is not consumable as written

[04-native-sdk.md, “Where it lives”](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:7) places `Package.swift` under `native/swift/ConcivWidget/`, but consumers are told to depend on the repository URL. SwiftPM resolves a source-control package from a package manifest at the checked-out repository root; it does not discover an arbitrary nested manifest from `.package(url:...)`.

[08-release-packaging.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/08-release-packaging.md:45) additionally proposes `swift/1.0.0` tags and asserts SwiftPM supports arbitrary tag strings. Version-based SwiftPM dependencies resolve semantic-version tags, conventionally `1.0.0` or `v1.0.0`; a slash-prefixed namespace is not a valid semantic-version tag for `exact:`/`from:` resolution.

The shared repository therefore needs a root `Package.swift` exposing the nested target, or the SDK needs its own repository. Tagging must use valid semantic-version tags, which also requires resolving collision/release ownership with npm tags rather than assuming a slash namespace.

## MAJOR

### 6. The page→native bridge lacks origin and frame validation

[02-bridge-protocol.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:12) registers a globally named `WKScriptMessageHandler`, and [04-native-sdk.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:94) only specifies decoding its body.

`WKScriptMessageHandler` is callable by scripts in loaded content and frames. The plan does not require validation of:

- `message.frameInfo.isMainFrame`
- the committed document origin/URL
- navigation redirects
- whether the handler remains installed after navigating away
- teardown through `removeScriptMessageHandler(forName:)`

A compromised dev page, redirect, or iframe could invoke native grab actions and future privileged bridge operations. Since the WebView intentionally loads mutable local content, the SDK must pin permitted origins, reject non-main-frame messages, constrain navigation, and remove the handler on detach.

### 7. Native-to-page delivery is race-prone and loses messages

[02-bridge-protocol.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:14) uses direct `evaluateJavaScript("window.__concivNative.<method>(...)")`. No readiness queue or acknowledgement is defined.

`open`, `grabCapability`, re-handshake, and even a grab result can arrive:

- before the extension client installs `window.__concivNative`;
- during navigation/reload;
- after the pending request was cancelled or superseded.

The protocol says unknown versions are ignored but defines no response acknowledging readiness or delivery. `handshake.hello` is insufficient because it is itself emitted only by the client whose availability native is trying to establish. Native needs a state machine and queued delivery after an acknowledged `bridge.ready`; pending requests need explicit terminal states and teardown behavior.

### 8. Grab request concurrency and lifecycle are underspecified

[03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:120) describes promises keyed by `requestId`, but does not define:

- whether multiple `pick`/`comment` calls are allowed;
- what happens to the previous request when another starts;
- timeout behavior;
- cancellation acknowledgement;
- duplicate or late `grabResult` handling;
- WebView teardown/reload cleanup.

The existing web implementation explicitly resolves an earlier pending pick with `null` before starting another ([grab-api.ts](/Users/omrikatz/Public/web/aidx/packages/page/src/grab-api.ts:18)). The native protocol must preserve similarly deterministic semantics. Otherwise promises leak or late results can stage the wrong grab.

### 9. The native capture algorithm assumes UIKit views represent SwiftUI content

[04-native-sdk.md, “Pick mode”](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:102) says the spike’s recursive `UIView` walk ports mostly verbatim and presents this as support for UIKit/SwiftUI.

SwiftUI commonly renders substantial subtrees through private hosting/rendering views rather than one meaningful `UIView` per semantic element. A `UIView` hit-test walk may return a large hosting surface, miss text/control boundaries, and produce useless class names. `collectTexts` limited to `UILabel`/`UITextField` likewise does not reliably recover SwiftUI-visible text.

The plan acknowledges missing SwiftUI source locations but not the more fundamental selection/semantic problem. It needs a SwiftUI-specific opt-in mechanism—accessibility elements, explicit SDK modifiers/anchors, or an accessibility-tree-based picker—and acceptance tests using real SwiftUI screens.

### 10. The screenshot tool returns the wrong result shape for the agent runtime

[03-ios-extension.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/03-ios-extension.md:66) returns a PNG as a `dataUrl` inside a JSON object. The repository already provides `imageResult()` specifically to return image content parts to the model ([image-result.ts](/Users/omrikatz/Public/web/aidx/packages/extension/src/image-result.ts:11)), and existing extensions use it.

Embedding a full-screen PNG as JSON/base64 inflates tool text, risks context limits, and may not be interpreted as an image by the model. `ios.screenshot` should return `imageResult('image/png', base64, metadata)` and keep structured dimensions in the accompanying text detail.

### 11. “Fixtures prevent drift” is stronger than the tests described

[02-bridge-protocol.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/02-bridge-protocol.md:32) claims the shared fixtures ensure Zod and Codable “can never silently diverge.” Both schemas can independently add optional fields, accept unknown keys differently, or reject valid cases absent from the finite fixtures while every fixture still passes. Codable also ignores unknown keys by default, whereas Zod’s object behavior may strip them.

The tests described in [07-testing.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/07-testing.md:68) validate examples, not schema equivalence. Define strict unknown-key behavior, generate fixtures from a canonical schema, or add cross-language encoded-output comparison covering every variant and optional-field combination.

### 12. The Swift fixture layout conflicts with SwiftPM resource rules and CI claims

[04-native-sdk.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/04-native-sdk.md:41) proposes a test target resource path reaching outside the package, with an uncommitted “symlink/copy if blocked” fallback. SwiftPM target resources must reside within the target/package layout; an external `../../packages/extensions/...` resource is not a portable package definition.

Meanwhile [07-testing.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/07-testing.md:94) relies on `swift test` as the contract gate. The synchronization/generation step therefore cannot be deferred to the implementer. The plan must specify a committed fixture copy plus drift check, a root-level package layout that owns both, or a deterministic generation command wired into CI.

## MINOR

### 13. The launcher recommendation contradicts itself

[05-widget-side.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/05-widget-side.md:19) explicitly introduces `launcher:false` because `modal:false` is semantically different and should not be overloaded. [README.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/README.md:50) then states “`launcher:false` (i.e. `modal:false`)”.

Current code confirms `modal` controls both the FAB gate and modal configuration ([settings.ts](/Users/omrikatz/Public/web/aidx/apps/conciv/src/data/settings.ts:41), [\_\_root.tsx](/Users/omrikatz/Public/web/aidx/apps/conciv/src/routes/__root.tsx:238)). The README shorthand would lead an implementer to bypass the new setting and preserve the ambiguity the plan intended to remove.

### 14. The fallow packaging claim does not match current configuration

[08-release-packaging.md](/Users/omrikatz/Public/web/aidx/plans/ios-extension/08-release-packaging.md:14) treats adding every new published extension to fallow `publicPackages` as established sibling precedent. In the actual configuration, `@conciv/extension-terminal`, `@conciv/extension-recorder`, and several other published packages are absent from `publicPackages` ([.fallowrc.json](/Users/omrikatz/Public/web/aidx/.fallowrc.json:79)), despite being in `PUBLIC_PACKAGES` ([guards.ts](/Users/omrikatz/Public/web/aidx/packages/publish/src/guards.ts:18)).

Adding iOS may still be desirable, but it is not “follow terminal verbatim,” and the plan should resolve whether the fallow list is intentionally selective or stale before encoding a new rule.

## Riskiest assumption overall

The riskiest assumption is that an ordinary extension client can reconfigure host-level widget infrastructure after mount. Both load-bearing requirements—replacing `GrabApi` and rebinding RPC—are unavailable in the current extension API and embed lifecycle. This invalidates the proposed native grab and handshake architecture simultaneously.

**Verdict: needs redesign.**
