# 09 — Android sketch (one page)

> **Review fixes (review-01-codex): B4 coherence.** iOS **cut `viewHierarchy`** in v1 (no `simctl`
> hierarchy dump; no server→WebView push — `03`/`10` Q3). Android is different: `adb shell uiautomator
dump` (and the Compose semantics tree) **is** a real server-side hierarchy source, so Android may keep a
> `*.viewHierarchy` tool where iOS cannot. The tool-name table below lists it as an Android capability, not
> a shared v1 tool.

Android is a direct parallel of the iOS design. The whole point of the host-neutral grab contract (`01`)
and the versioned bridge protocol (`02`) is that Android reuses them unchanged. Only the native layer and
transport specifics differ. This is a sketch, not a full plan; it exists so the iOS work does not paint
Android into a corner.

## What is shared verbatim

- **`@conciv/grab` contract** — Android emits `preview.kind === 'image'` grabs, identical shape.
- **`@conciv/extension-ios` → generalize to a platform-agnostic core.** In practice: keep the tool
  _names_ stable across platforms (`build`/`run`/`screenshot`/`logs`; plus Android-only `viewHierarchy`
  via `uiautomator`/Compose semantics, which iOS lacks in v1), but Android needs
  its own server wrappers (gradle/adb, not xcodebuild/simctl). Decide at implementation time whether this
  is a second extension (`@conciv/extension-android`) sharing a common tool-logic module, or one
  extension with a `platform` config. **Recommendation: one shared tool-contract module + per-platform
  runner seams** (the `SimctlRunner`/`XcodeRunner` seam from `07` gets a `GradleRunner`/`AdbRunner`
  sibling), so `ios.build`/`android.build` share parsing where possible and differ only in the runner.
- **Bridge protocol + fixtures** — the same JSON messages; Android decodes them with Kotlin
  `kotlinx.serialization` against the same `fixtures/bridge/*.json`. Same conformance guarantee as Swift.

## Tool mapping

| tool              | iOS wraps                           | Android wraps                                          |
| ----------------- | ----------------------------------- | ------------------------------------------------------ |
| `*.build`         | `xcodebuild` / `swiftc`             | `./gradlew assembleDebug`                              |
| `*.run`           | `simctl install` + `launch`         | `adb install` + `am start`                             |
| `*.screenshot`    | `simctl io screenshot`              | `adb exec-out screencap -p`                            |
| `*.logs`          | `simctl spawn log show`             | `adb logcat -d`                                        |
| `*.viewHierarchy` | UIKit hit-test walk / accessibility | `adb shell uiautomator dump` or Compose semantics tree |

## Transport (see `06`)

- **Emulator:** core reachable at `http://10.0.2.2:<port>` (the emulator's host-loopback alias).
- **Device:** `adb reverse tcp:<port> tcp:<port>` then `http://127.0.0.1:<port>`. Cleaner than iOS —
  no LAN/QR needed for USB-connected devices; recommend leading the physical-device story on Android.

## Native layer

- **WebView:** Android `WebView` with `setBackgroundColor(Color.TRANSPARENT)` — the transparency recipe's
  analog to `isOpaque=false`. Host `WebView` in a passthrough overlay (`WindowManager` overlay or a
  transparent `View` in the activity's content), with touch-passthrough when the panel is closed
  (analog of the `hitTest` override — override `onInterceptTouchEvent`/`dispatchTouchEvent`).
- **Bridge:** Page→Native via `@JavascriptInterface` (`addJavascriptInterface(bridge, "concivBridge")`,
  matching `window.concivBridge` shape used in `02` — note iOS uses `webkit.messageHandlers.concivBridge`;
  the page's `hasNativeBridge()` check must recognize both). Native→Page via
  `webView.evaluateJavascript("window.__concivNative.*(...)", null)`. Same method names.
- **Shared bridge-client state machine (D11/M-A14).** The page-side ready/loading/crashed/torn-down
  machine, outbound queue, `seq`/ack, retry-until-acked, and singleton-pick logic live in the
  platform-neutral `packages/extensions/ios/src/shared/bridge-client.ts` (`02` D11) with the transport
  **injected**. Android reuses that exact machine — only the transport differs: `@JavascriptInterface`
  methods take **strings** (JSON must be `JSON.parse`d/`JSON.stringify`d at the boundary, vs iOS's structured
  `postMessage` bodies), and `evaluateJavascript` is the Native→Page call. For v1 Android imports the shared
  module from `@conciv/extension-ios`; when Android graduates to its own package the module moves to a shared
  package. Android does **not** re-implement the machine.
- **Pick + capture:** walk the Android `View` tree (or the Compose semantics tree) for hit-testing;
  capture via `View.draw(Canvas)` to a `Bitmap` → PNG → data-URL (analog of `drawHierarchy`/`renderView`).

## Android's structural advantage: Compose source info

Jetpack Compose retains **source information** at runtime (the compiler can emit composable call
positions; tooling like Layout Inspector reads `file:line` for composables). This is the thing SwiftUI
lacks (`03`, `10`). On Android the grab payload's `source.filePath`/`lineNumber` can be populated
**accurately for Compose UIs** without a11y-id conventions or a build-time index — a materially better
source-context story than iOS v1. Design the Android `viewHierarchy`/grab to read Compose semantics +
source info where present, falling back to the a11y-id convention for View-based UIs.

## Live edit

Android supports Compose live-edit / hot-reload and `adb install -r`, so the `*.build`/`*.run` loop is
comparably fast to the `swiftc` demo path. The `*.inject` future tool (iOS dyld interpose, `03`) has a
natural Android analog in Compose live-edit; both stay parked until the core loop ships.

## Bottom line

Android reuses `01` and `02` unchanged, needs a Kotlin twin of the Swift SDK, a gradle/adb runner seam
under the shared tool contract, and gets _better_ source context for free on Compose. No iOS decision in
this plan blocks it.
