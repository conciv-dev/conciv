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

enum Outbound {
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

  var version: Int {
    switch self {
    case .handshake(let m): return m.v
    case .incompatible(let m): return m.v
    case .open(let m): return m.v
    case .close(let m): return m.v
    case .grabResult(let m): return m.v
    case .grabCapability(let m): return m.v
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

// Queued/unacked calls carry the handshake epoch they were minted under, so a fresh
// handshake can drop every message from prior epochs (02 M-A5, supersede) before the
// stale rebind base is ever re-dispatched. attempts counts deliveries of this same seq so
// a lost ack gets a bounded retry instead of an immediate silent drop.
struct PendingOutbound {
  let call: Outbound
  let epoch: Int
  var attempts = 0
}

final class BridgeHandler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  static let handlerName = "concivBridge"
  private static let ackTimeout: TimeInterval = 1
  // Re-deliveries of an unacked non-critical call before it is dropped. A transient
  // evaluateJavaScript hiccup must not lose a grabResult on the first missed ack.
  private static let maxAckRetries = 2

  private weak var webView: WKWebView?
  private var coreOrigin: URL
  private let encoder = JSONEncoder()

  private(set) var state: BridgeState = .loading
  private var nextSeq = 1
  private(set) var queue: [PendingOutbound] = []
  private(set) var unacked: [Int: PendingOutbound] = [:]

  // The version stamped on every outbound message once the hello settles. Defaults to
  // our max so a pre-handshake incompatible reply still carries a sane version; the
  // negotiated value (min(hello.maxV, ourMaxV)) replaces it via setNegotiatedVersion.
  private(set) var negotiatedVersion = bridgeMaxVersion
  // Bumped on every new handshake; queued/unacked calls from an older epoch are dropped
  // so a lost-ack retry can never resurrect the previous endpoint base.
  private(set) var handshakeEpoch = 0

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
  // A provisional/committed navigation failed with a connection-refused/timeout class
  // error: the core stopped answering at the current base (same-core port drift or a
  // dead process). The owner starts bounded rediscovery (04 recovery loop).
  var onConnectionLost: (() -> Void)?

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

  // Same-core port drift moves the core to a new origin. Re-pin so the origin gate accepts
  // messages from the document reloaded at the new base and rejects the stale one.
  func rebind(to origin: URL) {
    coreOrigin = origin
  }

  // The agreed version from hello negotiation (min(hello.maxV, ourMaxV)); every
  // subsequent outbound message is stamped with it instead of our own max (02 D3).
  func setNegotiatedVersion(_ version: Int) {
    negotiatedVersion = version
  }

  // MARK: outbound helpers (set-state, seq-tagged)

  func sendHandshake(apiBase: String, token: String?) {
    handshakeEpoch += 1
    dropSupersededEpochs()
    let message = Handshake(v: negotiatedVersion, seq: takeSeq(), apiBase: apiBase, token: token)
    latestHandshake = message
    enqueue(.handshake(message))
  }

  // A reload re-points the document at a new base (same-core port drift, see
  // OverlayController.rebind). The reloaded page posts bridge.ready before handshake.hello,
  // so enterReady's resendCriticalState would otherwise replay the pre-drift handshake and
  // bounce the page's RPC/SSE onto the dead base for one round-trip before the fresh hello
  // corrects it. Restage the stored handshake at the live base under a new epoch BEFORE the
  // load: the ready-time resend then carries the live base, and every prior-epoch queued or
  // unacked call is superseded so a lost-ack retry can never resurrect the dead base.
  func restageHandshake(apiBase: String, token: String?) {
    handshakeEpoch += 1
    dropSupersededEpochs()
    latestHandshake = Handshake(v: negotiatedVersion, seq: takeSeq(), apiBase: apiBase, token: token)
  }

  // A new handshake supersedes the previous one: drop every queued/unacked call minted
  // under an earlier epoch so a lost-ack retry cannot re-send a dead endpoint base after
  // the new hello (02 M-A5; the rebind-ordering hazard). The latest capability is
  // re-enqueued fresh by the handshake settle path, so nothing durable is lost.
  private func dropSupersededEpochs() {
    queue.removeAll { $0.epoch < handshakeEpoch }
    unacked = unacked.filter { $0.value.epoch >= handshakeEpoch }
  }

  func sendIncompatible(nativeMinV: Int, nativeMaxV: Int) {
    enqueue(.incompatible(BridgeIncompatible(v: negotiatedVersion, seq: takeSeq(), nativeMinV: nativeMinV, nativeMaxV: nativeMaxV)))
  }

  func sendOpen() {
    enqueue(.open(Open(v: negotiatedVersion, seq: takeSeq())))
  }

  func sendClose() {
    enqueue(.close(Close(v: negotiatedVersion, seq: takeSeq())))
  }

  func sendGrabResult(requestId: String, grab: NeutralGrab?, reason: GrabResultReason?) {
    enqueue(.grabResult(GrabResult(v: negotiatedVersion, seq: takeSeq(), requestId: requestId, grab: grab, reason: reason)))
  }

  func sendGrabCapability(_ grabbable: Bool) {
    let message = GrabCapability(v: negotiatedVersion, seq: takeSeq(), grabbable: grabbable)
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
    queue.append(PendingOutbound(call: call, epoch: handshakeEpoch))
    if state == .ready { flush() }
  }

  private func flush() {
    guard state == .ready else { return }
    let pending = queue
    queue.removeAll()
    for entry in pending { dispatch(entry) }
  }

  private func dispatch(_ entry: PendingOutbound) {
    guard state == .ready, let webView else { return }
    let call = entry.call
    let payload: String
    do {
      payload = try call.jsonPayload(encoder: encoder)
    } catch {
      return
    }
    unacked[call.seq] = entry
    let script = "window.__concivNative && window.__concivNative.\(call.method)(\(payload))"
    webView.evaluateJavaScript(script) { [weak self] _, error in
      guard let self, let error else { return }
      self.reportDispatchFailure(call, detail: error.localizedDescription)
    }
    scheduleRetry(for: call.seq)
  }

  // A grabResult that never reaches the page leaves the pending pick unresolved: the
  // page-side pick timeout is the backstop, but the delivery failure must not be
  // swallowed. Surface it as a host log so the failed delivery is visible, whether it
  // failed in evaluateJavaScript or ran out of ack retries.
  private func reportDispatchFailure(_ call: Outbound, detail: String) {
    guard case .grabResult = call else { return }
    onLog?(HostLog(v: negotiatedVersion, level: .error, message: "grabResult delivery failed for seq \(call.seq): \(detail)"))
  }

  // The ack never arrived. A superseded epoch drops immediately (never retry a call minted
  // against a dead endpoint base across a rebind/reload); the handshake retries forever
  // because it carries the live base; every other call gets maxAckRetries re-deliveries and
  // is only then dropped, reported so a lost grabResult is observable.
  private func scheduleRetry(for seq: Int) {
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.ackTimeout) { [weak self] in
      guard let self, self.state == .ready, let entry = self.unacked[seq] else { return }
      guard entry.epoch >= self.handshakeEpoch else {
        self.unacked.removeValue(forKey: seq)
        return
      }
      if entry.call.isCritical {
        self.dispatch(entry)
        return
      }
      guard entry.attempts < Self.maxAckRetries else {
        self.unacked.removeValue(forKey: seq)
        self.reportDispatchFailure(entry.call, detail: "no ack after \(entry.attempts + 1) deliveries")
        return
      }
      var retry = entry
      retry.attempts += 1
      self.dispatch(retry)
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
      onLog?(HostLog(v: negotiatedVersion, level: .warn, message: "dropped non-main-frame bridge message"))
      return
    }
    guard originMatches(message.frameInfo) else {
      onLog?(HostLog(v: negotiatedVersion, level: .warn, message: "dropped off-origin bridge message"))
      return
    }
    guard let raw = jsonData(from: message.body), let decoded = try? JSONDecoder().decode(BridgeMessage.self, from: raw) else {
      return
    }
    receive(decoded)
  }

  // Transport-agnostic entry: the WKScriptMessage path decodes then hands the message
  // here, so the ready/queue/ack/handshake logic is exercisable without a live WebView.
  func receive(_ message: BridgeMessage) {
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
  // a fresh /t/<newtoken> mount, 06 D13). CANCEL the response so the error page never
  // commits over the live native bundle: the current bridge-capable document stays
  // alive and the owner surfaces the re-pair prompt + rediscovery (04). The status
  // never carries the token, so this path logs nothing.
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationResponse: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    guard let http = navigationResponse.response as? HTTPURLResponse, ConcivDiscovery.isStaleToken(status: http.statusCode) else {
      decisionHandler(.allow)
      return
    }
    decisionHandler(.cancel)
    onStaleToken?()
  }

  // A connection refusal/timeout never produces the 401/404 response above: the core
  // simply stopped answering at the current base (same-core port drift or a dead
  // process). Provisional failures leave the committed document intact (no WKWebView
  // error page), so keep it and hand off to bounded rediscovery instead of reloading a
  // dead URL. Cancellations (our own .cancel policy, or a superseding load) are ignored.
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    handleNavigationFailure(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    handleNavigationFailure(error)
  }

  private func handleNavigationFailure(_ error: Error) {
    guard state != .tornDown, Self.isConnectionFailure(error) else { return }
    enterLoading()
    onConnectionLost?()
  }

  // Connection-refused / timeout class URLErrors mean the base is unreachable; an
  // NSURLErrorCancelled (our own response cancel, or a load superseded by a rebind) is
  // not a loss and must not trigger a redundant rediscovery.
  static func isConnectionFailure(_ error: Error) -> Bool {
    let ns = error as NSError
    guard ns.domain == NSURLErrorDomain else { return false }
    let connectionFailures: Set<Int> = [
      NSURLErrorCannotConnectToHost,
      NSURLErrorTimedOut,
      NSURLErrorNetworkConnectionLost,
      NSURLErrorCannotFindHost,
      NSURLErrorNotConnectedToInternet,
      NSURLErrorDNSLookupFailed,
      NSURLErrorResourceUnavailable,
    ]
    return connectionFailures.contains(ns.code)
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
