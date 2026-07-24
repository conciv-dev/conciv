# Appendix A — Spike reference snippets

The four spikes (2026-07-23) lived in the session scratchpad and are being deleted. This appendix
preserves the load-bearing fragments verbatim so the implementing agents have the proven mechanics. These
are **spike-grade** (hardcoded to a demo `PaymentsViewController`, ad-hoc globals); `03`/`04` describe how
to generalize them. Treat the mechanics as correct (they passed) and the structure as throwaway.

Source paths (now deleted): `scratchpad/ios-spike-v2/Sources/PaymentsViewController.swift`,
`scratchpad/ios-spike-v2/{build,relaunch,run}.sh`, `scratchpad/ios-spike-v2/Info.plist`,
`scratchpad/webview-spike/overlay.html`.

---

## A.1 — Transparent overlay recipe (Swift)

From `toggleOverlay()`. The exact settings that make native UI show through the WebView:

```swift
let configuration = WKWebViewConfiguration()
configuration.allowsInlineMediaPlayback = true
configuration.mediaTypesRequiringUserActionForPlayback = []
configuration.userContentController.add(self, name: "concivBridge")   // Page -> Native handler

let web = WKWebView(frame: view.bounds, configuration: configuration)
web.isOpaque = false
web.backgroundColor = .clear
web.scrollView.backgroundColor = .clear
web.scrollView.isOpaque = false
web.allowsBackForwardNavigationGestures = false
if #available(iOS 16.4, *) {
    web.isInspectable = true          // Safari Web Inspector attaches in DEBUG
}
web.load(URLRequest(url: overlayURL))
```

The host HTML must also be transparent (see A.5). The spike inserted the web view **below the FAB**
(`view.insertSubview(web, belowSubview: fab)`) so the native FAB stays on top.

---

## A.2 — Bridge handler registration + Native->Page delivery (Swift)

`WKScriptMessageHandler` receives Page->Native; `evaluateJavaScript` sends Native->Page.

```swift
// Page -> Native
func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "concivBridge" else { return }
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    if type == "grab.pick" { enterPickMode() }
}

// Native -> Page (spike used an ad-hoc global; production uses window.__concivNative.grabResult, see 02)
private func deliverToPage(payload: [String: Any]) {
    guard let web = overlay,
          let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
          let json = String(data: data, encoding: .utf8) else { return }
    let script = "window.concivNativeGrabResult && window.concivNativeGrabResult(\(json))"
    web.evaluateJavaScript(script)
}
```

---

## A.3 — Native pick mode core (Swift)

The hit-test walk, the "interesting view" heuristic, and the capture. This is the heart of the native grab
and ports mostly verbatim (generalize `pickTarget` to start from the key window's root, excluding the
SDK's own overlay/FAB, instead of a VC `view`).

```swift
final class PickOverlayView: UIView {
    var onMove: ((CGPoint) -> Void)?
    var onSelect: ((CGPoint) -> Void)?
    override func touchesBegan(_ t: Set<UITouch>, with e: UIEvent?) { t.first.map { onMove?($0.location(in: self)) } }
    override func touchesMoved(_ t: Set<UITouch>, with e: UIEvent?) { t.first.map { onMove?($0.location(in: self)) } }
    override func touchesEnded(_ t: Set<UITouch>, with e: UIEvent?) { t.first.map { onSelect?($0.location(in: self)) } }
}

// "is this view worth grabbing?"
private func isInteresting(_ v: UIView) -> Bool {
    if let label = v as? UILabel { return !(label.text?.isEmpty ?? true) }
    if let image = v as? UIImageView { return image.image != nil }
    if v is UIControl { return true }
    if v is UITableViewCell { return true }
    let bg = v.backgroundColor
    let hasFill = bg != nil && bg != .clear && (bg?.cgColor.alpha ?? 0) > 0.01
    return hasFill && v.bounds.width > 24 && v.bounds.height > 24
}

// deepest interesting view under the point; skips the overlay/FAB via isExcluded
private func search(_ node: UIView, _ windowPoint: CGPoint) -> UIView? {
    for child in node.subviews.reversed() {
        if child.isHidden || child.alpha < 0.02 { continue }
        if isExcluded(child) { continue }
        let localPoint = child.convert(windowPoint, from: nil)
        if !child.bounds.contains(localPoint) { continue }
        if let deeper = search(child, windowPoint) { return deeper }
        if isInteresting(child) { return child }
    }
    return nil
}

// capture: drawHierarchy at 2x -> JPEG data-URL
private func renderView(_ target: UIView) -> UIImage? {
    let bounds = target.bounds
    if bounds.width < 1 || bounds.height < 1 { return nil }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 2
    return UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
        target.drawHierarchy(in: bounds, afterScreenUpdates: true)
    }
}
```

Payload assembly (spike `performPick`) — the fields that became `NeutralGrab` (`02`). Note the spike put
class/container/a11y/text/frame/vc + a base64 JPEG data-URL:

```swift
let base64 = image.flatMap { $0.jpegData(compressionQuality: 0.6)?.base64EncodedString() } ?? ""
let payload: [String: Any] = [
    "class": classLabel(for: picked),
    "container": cell.map { NSStringFromClass(type(of: $0)) } ?? "",
    "accessibilityId": picked.accessibilityIdentifier ?? "",
    "accessibilityLabel": picked.accessibilityLabel ?? "",
    "text": texts.joined(separator: " · "),
    "frame": ["x": ..., "y": ..., "width": ..., "height": ...],   // frame in window points
    "vc": "PaymentsViewController",
    "image": base64.isEmpty ? "" : "data:image/jpeg;base64,\(base64)",
]
```

`collectTexts` walks the subtree gathering `UILabel.text` / `UITextField.text`. Highlight/label-chip
follow the finger via `updateHighlight(at:)` (border color + translucent fill + class-name chip above the
frame). `screenshotTarget(for:)` promotes a tapped label/image to its enclosing cell's card for a nicer
capture.

---

## A.4 — Page-side bridge (overlay.html)

The proven page mechanics: intercept the grab button, receive the native result, inject text into the
composer, and attach the image to the file input. **These become the `@conciv/extension-ios` client
(`03`) driving `HostWiring.insert`/`attach` — do not ship this HTML approach; it is here for the
mechanics.**

```js
function hasNativeBridge() {
  return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.concivBridge)
}

// intercept the grab button by aria-label (SPIKE HACK -> real GrabApi wiring in 03)
document.addEventListener(
  'click',
  (event) => {
    const path = event.composedPath ? event.composedPath() : []
    const button = path.find(
      (n) => n && n.getAttribute && n.getAttribute('aria-label') === 'Select an element from the page',
    )
    if (!button || !hasNativeBridge()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    window.webkit.messageHandlers.concivBridge.postMessage({type: 'grab.pick'})
  },
  true,
)

// deep query across shadow roots (widget mounts in a shadow root)
function deepQueryAll(selector) {
  const out = []
  const roots = [document]
  while (roots.length) {
    const root = roots.shift()
    try {
      for (const el of root.querySelectorAll(selector)) out.push(el)
    } catch (e) {}
    try {
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot)
    } catch (e) {}
    if (root === document) {
      const host = document.querySelector('[data-conciv-script-root]')
      if (host && host.shadowRoot) roots.push(host.shadowRoot)
    }
  }
  return out
}

// inject text via the real value-setter + input event (React/Solid-safe)
function setTextareaValue(el, text) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  el.focus()
  setter.call(el, text)
  el.dispatchEvent(new Event('input', {bubbles: true}))
  el.dispatchEvent(new Event('change', {bubbles: true}))
}

// attach an image data-URL to the file input via DataTransfer
function attachImage(dataUrl) {
  const input = deepQueryAll('input[type="file"]')[0]
  if (!input) return false
  const file = dataUrlToFile(dataUrl, 'native-grab.jpg')
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event('change', {bubbles: true}))
  return true
}

// Native -> Page entry point (spike global; production = window.__concivNative.grabResult)
window.concivNativeGrabResult = function (payload) {
  const input = deepQueryAll('textarea[aria-label="Message the conciv agent"]')[0] || deepQueryAll('textarea')[0]
  if (input) setTextareaValue(input, (input.value || '') + formatPayloadText(payload))
  if (payload.image) attachImage(payload.image)
}
```

The two `aria-label` strings the spike depended on: `"Select an element from the page"` (grab button) and
`"Message the conciv agent"` (composer). `03`'s first-class wiring removes the label dependency — the
extension client provides the `GrabApi` directly, so the widget calls it without any DOM interception.

---

## A.5 — Host page transparency (overlay.html head)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="pw-api-base" content="http://127.0.0.1:49172" />
<!-- SPIKE HACK: hardcoded, drifted; see 06 -->
<meta name="pw-widget" content='{"defaultOpen":true}' />
<style>
  :root {
    color-scheme: dark;
  }
  html,
  body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: transparent !important;
    background-color: transparent !important;
  }
  body {
    font-family: -apple-system, system-ui, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
</style>
<script src="./conciv-widget.global.js"></script>
```

The `setInterval` that dispatched `conciv:open-panel` every 600ms until the panel opened is the open-hack
`05` item 2 replaces.

---

## A.6 — Build (swiftc, no xcodeproj) — build.sh

Direct `swiftc` compile + hand-assembled `.app` bundle; no `.xcodeproj`, no signing needed for the
simulator. This is the fast path `ios.build` reproduces under `buildMode: 'swiftc'` (`03`).

```bash
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"                                   # arm64 on Apple Silicon
TARGET="${ARCH}-apple-ios17.0-simulator"

xcrun --sdk iphonesimulator swiftc \
    -sdk "$SDK_PATH" -target "$TARGET" -module-name ConcivSpike2 -O \
    -framework UIKit -framework WebKit \
    -o "$APP/ConcivSpike2" \
    Sources/AppDelegate.swift Sources/SceneDelegate.swift Sources/PaymentsViewController.swift

plutil -convert binary1 -o "$APP/Info.plist" Info.plist   # binary plist in the bundle
printf 'APPL????' > "$APP/PkgInfo"
codesign --force --sign - --timestamp=none "$APP"          # ad-hoc; simulator install needs no real signing
```

---

## A.7 — Relaunch loop + the SIMCTL_CHILD env gotcha — relaunch.sh

The 3-4s build->install->launch cycle. **`simctl launch --setenv` does not exist** — pass child env via
`SIMCTL_CHILD_<VAR>` prefixes on `simctl launch` itself. `ios.run` (`03`) uses exactly this.

```bash
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
UDID="${UDID:-<booted-udid>}"
BUNDLE_ID="dev.conciv.spike2"
URL="${CONCIV_URL:-http://127.0.0.1:8891/overlay.html}"

./build.sh
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true   # tolerate not-running
xcrun simctl install "$UDID" "build/ConcivSpike2.app"

SIMCTL_CHILD_CONCIV_URL="$URL" \
SIMCTL_CHILD_CONCIV_AUTOSHOW="1" \
    xcrun simctl launch "$UDID" "$BUNDLE_ID"
```

The launched app reads its env normally (`ProcessInfo.processInfo.environment["CONCIV_URL"]`); the
`SIMCTL_CHILD_` prefix is stripped by `simctl` when it spawns the child.

---

## A.8 — ATS / Info.plist (loopback)

Verdict #1: `NSAllowsLocalNetworking` alone is sufficient for loopback; the spike also set
`NSAllowsArbitraryLoads` for convenience but it is not required. Consumers of the SDK add:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsLocalNetworking</key><true/>
</dict>
<key>NSLocalNetworkUsageDescription</key>
<string>Loads a local development server for testing.</string>
```

Deployment target iOS 17.0 (spike); the widget itself was verified on the iOS 26.5 simulator.
