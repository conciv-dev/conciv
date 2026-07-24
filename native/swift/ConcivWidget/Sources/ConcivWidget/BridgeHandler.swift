#if canImport(UIKit)
import Foundation
import WebKit

// The Native<->Page bridge: one WKScriptMessageHandler named "concivBridge",
// origin- and main-frame-pinned (02 M6), driving the ready/queue/crashed state
// machine (02 M7/D4). Native->Page calls invoke window.__concivNative.<method>
// with the exact method names the ios client installs (client.tsx): handshake,
// bridgeIncompatible, open, close, grabResult, grabCapability.

enum BridgeState {
  case loading
  case ready
  case crashed
  case tornDown
}

private enum Outbound {
  case handshake(Handshake)
  case incompatible(BridgeIncompatible)
  case open(Open)
  case close(Close)
  case grabResult(GrabResult)
  case grabCapability(GrabCapability)

  var seq: Int {
    switch self {
    case .handshake(let m): return m.seq
    case .incompatible(let m): return m.seq
    case .open(let m): return m.seq
    case .close(let m): return m.seq
    case .grabResult(let m): return m.seq
    case .grabCapability(let m): return m.seq
    }
  }

  var method: String {
    switch self {
    case .handshake: return "handshake"
    case .incompatible: return "bridgeIncompatible"
    case .open: return "open"
    case .close: return "close"
    case .grabResult: return "grabResult"
    case .grabCapability: return "grabCapability"
    }
  }

  // handshake carries the rebind base and must never be dropped; it is re-sent on
  // every transition to ready (02 M-A5/D4).
  var isCritical: Bool {
    if case .handshake = self { return true }
    return false
  }

  func jsonPayload(encoder: JSONEncoder) throws -> String {
    let data: Data
    switch self {
    case .handshake(let m): data = try encoder.encode(m)
    case .incompatible(let m): data = try encoder.encode(m)
    case .open(let m): data = try encoder.encode(m)
    case .close(let m): data = try encoder.encode(m)
    case .grabResult(let m): data = try encoder.encode(m)
    case .grabCapability(let m): data = try encoder.encode(m)
    }
    return String(decoding: data, as: UTF8.self)
  }
}

final class BridgeHandler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  static let handlerName = "concivBridge"
  private static let ackTimeout: TimeInterval = 1

  private weak var webView: WKWebView?
  private let coreOrigin: URL
  private let encoder = JSONEncoder()

  private(set) var state: BridgeState = .loading
  private var nextSeq = 1
  private var queue: [Outbound] = []
  private var unacked: [Int: Outbound] = [:]

  private var latestHandshake: Handshake?
  private var latestCapability: GrabCapability?

  var onReady: (() -> Void)?
  var onGrabPick: ((GrabPick) -> Void)?
  var onGrabCancel: ((GrabCancel) -> Void)?
  var onHandshakeHello: ((HandshakeHello) -> Void)?
  var onPanelToggled: ((HostPanelToggled) -> Void)?
  var onLog: ((HostLog) -> Void)?
  var onCrashRecovery: (() -> Void)?
  var onStaleToken: (() -> Void)?

  init(webView: WKWebView, coreOrigin: URL) {
    self.webView = webView
    self.coreOrigin = coreOrigin
    super.init()
    webView.configuration.userContentController.add(self, name: Self.handlerName)
    webView.navigationDelegate = self
  }

  func detach() {
    state = .tornDown
    queue.removeAll()
    unacked.removeAll()
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.handlerName)
  }

  // MARK: outbound helpers (set-state, seq-tagged)

  func sendHandshake(apiBase: String, token: String?) {
    let message = Handshake(v: bridgeMaxVersion, seq: takeSeq(), apiBase: apiBase, token: token)
    latestHandshake = message
    enqueue(.handshake(message))
  }

  func sendIncompatible(nativeMinV: Int, nativeMaxV: Int) {
    enqueue(.incompatible(BridgeIncompatible(v: bridgeMaxVersion, seq: takeSeq(), nativeMinV: nativeMinV, nativeMaxV: nativeMaxV)))
  }

  func sendOpen() {
    enqueue(.open(Open(v: bridgeMaxVersion, seq: takeSeq())))
  }

  func sendClose() {
    enqueue(.close(Close(v: bridgeMaxVersion, seq: takeSeq())))
  }

  func sendGrabResult(requestId: String, grab: NeutralGrab?) {
    enqueue(.grabResult(GrabResult(v: bridgeMaxVersion, seq: takeSeq(), requestId: requestId, grab: grab)))
  }

  func sendGrabCapability(_ grabbable: Bool) {
    let message = GrabCapability(v: bridgeMaxVersion, seq: takeSeq(), grabbable: grabbable)
    latestCapability = message
    enqueue(.grabCapability(message))
  }

  private func takeSeq() -> Int {
    let value = nextSeq
    nextSeq += 1
    return value
  }

  private func enqueue(_ call: Outbound) {
    guard state != .tornDown else { return }
    queue.append(call)
    if state == .ready { flush() }
  }

  private func flush() {
    guard state == .ready else { return }
    let pending = queue
    queue.removeAll()
    for call in pending { dispatch(call) }
  }

  private func dispatch(_ call: Outbound) {
    guard state == .ready, let webView else { return }
    let payload: String
    do {
      payload = try call.jsonPayload(encoder: encoder)
    } catch {
      return
    }
    unacked[call.seq] = call
    let script = "window.__concivNative && window.__concivNative.\(call.method)(\(payload))"
    webView.evaluateJavaScript(script, completionHandler: nil)
    scheduleRetry(for: call.seq)
  }

  private func scheduleRetry(for seq: Int) {
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.ackTimeout) { [weak self] in
      guard let self, self.state == .ready, let call = self.unacked[seq] else { return }
      if call.isCritical {
        self.dispatch(call)
      } else {
        self.unacked.removeValue(forKey: seq)
      }
    }
  }

  // MARK: state transitions

  private func enterReady() {
    let wasReady = state == .ready
    state = .ready
    if !wasReady {
      onReady?()
      resendCriticalState()
    }
    flush()
  }

  private func enterLoading() {
    guard state != .tornDown else { return }
    state = .loading
    unacked.removeAll()
  }

  private func resendCriticalState() {
    if let handshake = latestHandshake { enqueue(.handshake(handshake)) }
    if let capability = latestCapability { enqueue(.grabCapability(capability)) }
  }

  // MARK: WKScriptMessageHandler

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == Self.handlerName else { return }
    guard message.frameInfo.isMainFrame else {
      onLog?(HostLog(v: bridgeMaxVersion, level: .warn, message: "dropped non-main-frame bridge message"))
      return
    }
    guard originMatches(message.frameInfo) else {
      onLog?(HostLog(v: bridgeMaxVersion, level: .warn, message: "dropped off-origin bridge message"))
      return
    }
    guard let raw = jsonData(from: message.body), let decoded = try? JSONDecoder().decode(BridgeMessage.self, from: raw) else {
      return
    }
    handle(decoded)
  }

  private func handle(_ message: BridgeMessage) {
    switch message {
    case .bridgeReady:
      enterReady()
    case .bridgeAck(let ack):
      unacked.removeValue(forKey: ack.seq)
    case .handshakeHello(let hello):
      onHandshakeHello?(hello)
    case .grabPick(let pick):
      onGrabPick?(pick)
    case .grabCancel(let cancel):
      onGrabCancel?(cancel)
    case .hostPanelToggled(let toggled):
      onPanelToggled?(toggled)
    case .hostLog(let log):
      onLog?(log)
    default:
      break
    }
  }

  // MARK: WKNavigationDelegate

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    enterLoading()
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    decisionHandler(originMatches(url: url) ? .allow : .cancel)
  }

  // A 401/404 on the token-scoped native page = stale token (the core restarted onto
  // a fresh /t/<newtoken> mount, 06 D13). The status never carries the token, so this
  // path logs nothing.
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    if let http = navigationResponse.response as? HTTPURLResponse, ConcivDiscovery.isStaleToken(status: http.statusCode) {
      onStaleToken?()
    }
    decisionHandler(.allow)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    state = .crashed
    onCrashRecovery?()
    enterLoading()
    webView.reload()
  }

  // MARK: origin pinning

  private func originMatches(_ frameInfo: WKFrameInfo) -> Bool {
    let origin = frameInfo.securityOrigin
    guard let scheme = coreOrigin.scheme, let host = coreOrigin.host else { return false }
    let expectedPort = coreOrigin.port ?? defaultPort(for: scheme)
    let actualPort = origin.port == 0 ? defaultPort(for: origin.protocol) : origin.port
    return origin.protocol == scheme && origin.host == host && actualPort == expectedPort
  }

  private func originMatches(url: URL) -> Bool {
    guard let scheme = url.scheme, let host = url.host,
          let expectedScheme = coreOrigin.scheme, let expectedHost = coreOrigin.host else { return false }
    let expectedPort = coreOrigin.port ?? defaultPort(for: expectedScheme)
    let actualPort = url.port ?? defaultPort(for: scheme)
    return scheme == expectedScheme && host == expectedHost && actualPort == expectedPort
  }

  private func defaultPort(for scheme: String) -> Int {
    scheme == "https" ? 443 : 80
  }

  private func jsonData(from body: Any) -> Data? {
    if let string = body as? String { return string.data(using: .utf8) }
    if JSONSerialization.isValidJSONObject(body) {
      return try? JSONSerialization.data(withJSONObject: body)
    }
    return nil
  }
}
#endif
