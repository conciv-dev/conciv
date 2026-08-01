#if canImport(UIKit)
import XCTest
import UIKit
import WebKit
@testable import ConcivWidget

// Version negotiation, handshake supersede, and the bounded connection-recovery loop
// (02 D3/M-A5, 04 recovery). Runs on the simulator: BridgeHandler/OverlayController own a
// real WKWebView, but every transition is driven through the production seams (receive,
// the navigation delegate, the injected discovery driver) rather than a live network.
@MainActor
final class BridgeRecoveryTests: XCTestCase {
  private func url(_ string: String) -> URL {
    guard let value = URL(string: string) else { fatalError("bad test url \(string)") }
    return value
  }

  private func makeBridge() -> (BridgeHandler, WKWebView) {
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 10, height: 10))
    let bridge = BridgeHandler(webView: webView, coreOrigin: url("http://127.0.0.1:4599"))
    return (bridge, webView)
  }

  private func handshakes(in bridge: BridgeHandler) -> [Handshake] {
    bridge.unacked.values.compactMap { entry in
      guard case .handshake(let handshake) = entry.call else { return nil }
      return handshake
    }
  }

  private func opens(in bridge: BridgeHandler) -> [Open] {
    bridge.unacked.values.compactMap { entry in
      guard case .open(let open) = entry.call else { return nil }
      return open
    }
  }

  // Sent-or-still-queued opens. A failed page load flips the bridge back to loading and
  // clears the unacked table, so counting deliveries needs both sides.
  private func allOpens(in bridge: BridgeHandler) -> [Open] {
    (bridge.queue + Array(bridge.unacked.values)).compactMap { entry in
      guard case .open(let open) = entry.call else { return nil }
      return open
    }
  }

  // MARK: negotiation (item 1b)

  func testNegotiatedVersionStampsSubsequentSends() {
    let (bridge, _) = makeBridge()
    bridge.setNegotiatedVersion(2)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendOpen()
    XCTAssertEqual(opens(in: bridge).first?.v, 2, "sends must carry the negotiated version, not bridgeMaxVersion")
  }

  func testHandshakeCarriesTheNegotiatedVersion() {
    let (bridge, _) = makeBridge()
    bridge.setNegotiatedVersion(1)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendHandshake(apiBase: "http://127.0.0.1:4599", token: nil)
    XCTAssertEqual(handshakes(in: bridge).first?.v, 1)
  }

  // MARK: handshake supersede (item 2)

  // Reproduces the rebind-ordering hazard: a reload re-sends the OLD handshake base from
  // resendCriticalState, then the new hello enqueues the NEW base. Without epoch supersede
  // a lost old-ack retry would rebind RPC/SSE back to the dead core.
  func testNewHandshakeSupersedesStaleRebindBase() {
    let (bridge, webView) = makeBridge()
    bridge.setNegotiatedVersion(1)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendHandshake(apiBase: "http://127.0.0.1:4599", token: nil)

    bridge.webView(webView, didStartProvisionalNavigation: nil)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    bridge.sendHandshake(apiBase: "http://127.0.0.1:5200", token: nil)

    XCTAssertEqual(
      handshakes(in: bridge).map { $0.apiBase },
      ["http://127.0.0.1:5200"],
      "only the newest handshake base may remain unacked after a supersede"
    )
    XCTAssertFalse(
      bridge.queue.contains { entry in
        guard case .handshake(let handshake) = entry.call else { return false }
        return handshake.apiBase == "http://127.0.0.1:4599"
      },
      "the stale base must not linger in the queue either"
    )
  }

  // The reload's bridge.ready arrives before the fresh hello: without a restage the
  // resendCriticalState replay would dispatch the pre-drift base to the new page and bounce
  // its RPC/SSE onto the dead core. Restaging before the load must make that resend carry
  // the live base only.
  func testRestagedHandshakeResendsLiveBaseAfterReload() {
    let (bridge, webView) = makeBridge()
    bridge.setNegotiatedVersion(1)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendHandshake(apiBase: "http://127.0.0.1:4599", token: nil)

    bridge.restageHandshake(apiBase: "http://127.0.0.1:5200", token: nil)
    bridge.webView(webView, didStartProvisionalNavigation: nil)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    XCTAssertEqual(
      handshakes(in: bridge).map { $0.apiBase },
      ["http://127.0.0.1:5200"],
      "the reload's ready resend must carry the restaged live base, never the dead pre-drift base"
    )
  }

  // MARK: bounded ack retry

  private func grabResults(in bridge: BridgeHandler) -> [PendingOutbound] {
    bridge.unacked.values.filter { entry in
      guard case .grabResult = entry.call else { return false }
      return true
    }
  }

  // An unresponsive page that acks on a later delivery must still receive the grabResult: a
  // transient evaluateJavaScript hiccup used to drop it at the first ack timeout and leave
  // the page-side pick promise hanging until its own timeout.
  func testUnackedGrabResultIsRedeliveredBeforeBeingDropped() {
    let (bridge, _) = makeBridge()
    bridge.setNegotiatedVersion(1)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendGrabResult(requestId: "req-1", grab: nil, reason: .failed)
    guard let seq = grabResults(in: bridge).first?.call.seq else {
      return XCTFail("expected the grabResult to be unacked after the first dispatch")
    }

    spin(until: { self.grabResults(in: bridge).first?.attempts == 1 })
    XCTAssertEqual(grabResults(in: bridge).first?.attempts, 1, "the first missed ack must re-deliver, not drop")

    bridge.receive(.bridgeAck(BridgeAck(v: 1, seq: seq)))
    XCTAssertTrue(grabResults(in: bridge).isEmpty, "the ack on the second delivery settles the call")
  }

  // Retries are bounded: after the budget is spent the call is dropped, and the drop is
  // reported so a lost grabResult is observable instead of silent.
  func testExhaustedAckRetriesDropAndReportTheGrabResult() {
    let (bridge, _) = makeBridge()
    var drops: [String] = []
    bridge.onLog = { log in drops.append(log.message) }
    bridge.setNegotiatedVersion(1)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))
    bridge.sendGrabResult(requestId: "req-1", grab: nil, reason: .failed)

    spin(until: { drops.contains { $0.contains("no ack after") } }, timeout: 8)

    XCTAssertTrue(grabResults(in: bridge).isEmpty, "an exhausted call must not linger unacked")
    XCTAssertTrue(
      drops.contains { $0.contains("no ack after 3 deliveries") },
      "the timeout-exhausted drop must be reported, got \(drops)"
    )
  }

  // MARK: navigation-failure classification (item 3)

  func testConnectionRefusalTriggersConnectionLost() {
    let (bridge, webView) = makeBridge()
    var losses = 0
    bridge.onConnectionLost = { losses += 1 }
    bridge.webView(
      webView,
      didFailProvisionalNavigation: nil,
      withError: NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)
    )
    XCTAssertEqual(losses, 1)
  }

  func testCancelledNavigationIsNotAConnectionLoss() {
    let (bridge, webView) = makeBridge()
    var losses = 0
    bridge.onConnectionLost = { losses += 1 }
    bridge.webView(
      webView,
      didFailProvisionalNavigation: nil,
      withError: NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)
    )
    XCTAssertEqual(losses, 0, "a cancelled/superseded load must not start rediscovery")
  }

  // MARK: recovery loop end-to-end (items 3, 5, 7)

  private func makeOverlay(pid: Int, port: Int) -> (OverlayController, UIWindow) {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.isHidden = false
    let endpoint = ConcivEndpoint(apiBase: url("http://127.0.0.1:\(port)"), token: nil, pid: pid)
    let overlay = OverlayController(hostWindow: window, endpoint: endpoint, launcher: .native)
    overlay.recoveryDelays = [0.02, 0.02, 0.02]
    return (overlay, window)
  }

  private func failProvisional(_ overlay: OverlayController) {
    guard let bridge = overlay.webView.navigationDelegate as? BridgeHandler else {
      return XCTFail("expected the bridge to be the navigation delegate")
    }
    bridge.webView(
      overlay.webView,
      didFailProvisionalNavigation: nil,
      withError: NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)
    )
  }

  private func spin(until condition: () -> Bool, timeout: TimeInterval = 3) {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline && !condition() {
      RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
    }
  }

  override func setUp() {
    super.setUp()
    ConcivAnchorRegistry.shared.reset()
  }

  override func tearDown() {
    ConcivAnchorRegistry.shared.reset()
    ConcivWidget.detach()
    ConcivWidget.discoverDriver = ConcivDiscoveryRuntime.discover
    ConcivWidget.keyWindowProvider = ConcivWidget.defaultKeyWindowProvider
    super.tearDown()
  }

  // Wiring guard: rebind itself must restage the handshake at the rediscovered base so the
  // reload's bridge.ready resend never replays the dead pre-drift base (see restageHandshake).
  func testRebindRestagesHandshakeAtTheRediscoveredBase() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    guard let bridge = overlay.webView.navigationDelegate as? BridgeHandler else {
      return XCTFail("expected the bridge to be the navigation delegate")
    }
    let moved = ConcivEndpoint(apiBase: url("http://127.0.0.1:59991"), token: nil, pid: 100)

    overlay.rebind(to: moved)
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    XCTAssertEqual(
      handshakes(in: bridge).map { $0.apiBase },
      ["http://127.0.0.1:59991"],
      "rebind must restage the handshake so the reload's ready resends the live base"
    )
    overlay.detach()
  }

  func testConnectionLossRediscoversAndRebindsSameCore() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    let moved = ConcivEndpoint(apiBase: url("http://127.0.0.1:59991"), token: nil, pid: 100)
    overlay.onDiscover = { completion in completion(moved) }
    overlay.onDifferentCore = { _ in XCTFail("same-core drift must rebind, never remount") }

    failProvisional(overlay)
    spin(until: { overlay.endpoint == moved })

    XCTAssertEqual(overlay.endpoint, moved, "same-core port drift must rebind to the rediscovered base")
    overlay.detach()
  }

  func testConnectionLossToADifferentCoreHandsOffForRemount() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    let replacement = ConcivEndpoint(apiBase: url("http://127.0.0.1:59992"), token: nil, pid: 200)
    var handedOff: ConcivEndpoint?
    overlay.onDiscover = { completion in completion(replacement) }
    overlay.onDifferentCore = { handedOff = $0 }

    failProvisional(overlay)
    spin(until: { handedOff != nil })

    XCTAssertEqual(handedOff, replacement, "a changed pid must hand off for a fresh mount")
    XCTAssertEqual(overlay.endpoint.apiBase, url("http://127.0.0.1:59990"), "the old controller must not rebind to a different core")
    overlay.detach()
  }

  func testRediscoveryFailureKeepsTheRepairPromptVisible() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    overlay.onDiscover = { completion in completion(nil) }

    failProvisional(overlay)
    spin(until: { overlay.isRepairPromptVisible })

    XCTAssertTrue(overlay.isRepairPromptVisible, "no reachable core must keep the prompt, never a dead end")
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.2))
    XCTAssertTrue(overlay.isRepairPromptVisible, "the prompt stays while the bounded loop retries")
    overlay.detach()
  }

  // MARK: --autoshow one-shot

  private func hello() -> BridgeMessage {
    .handshakeHello(HandshakeHello(v: 1, minV: 1, maxV: 1, clientId: "test", bundleReady: true))
  }

  private func panelToggled(open: Bool) -> BridgeMessage {
    .hostPanelToggled(HostPanelToggled(v: 1, open: open, connected: true, mascotRect: nil))
  }

  private func bridge(of overlay: OverlayController) -> BridgeHandler? {
    overlay.webView.navigationDelegate as? BridgeHandler
  }

  // The page turns `open` into a window event the widget shell only listens for once its
  // root mounts, and the shell's first host.panelToggled is the proof that it has. An open
  // sent straight back from the hello lands before that and is lost with no retry.
  func testAutoShowWaitsForThePageToReportItsPanelState() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    guard let bridge = bridge(of: overlay) else { return XCTFail("expected the bridge") }
    overlay.autoShowPending = true
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    bridge.receive(hello())
    XCTAssertEqual(allOpens(in: bridge).count, 0, "a hello alone reaches the page before the shell listens")

    bridge.receive(panelToggled(open: false))
    XCTAssertEqual(allOpens(in: bridge).count, 1, "the shell reporting its panel state must drive the one-shot open")

    bridge.receive(panelToggled(open: true))
    bridge.receive(panelToggled(open: false))
    XCTAssertEqual(allOpens(in: bridge).count, 1, "autoshow is a one-shot, never a re-open")
    overlay.detach()
  }

  func testAutoShowStaysSilentWithoutTheFlag() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    guard let bridge = bridge(of: overlay) else { return XCTFail("expected the bridge") }
    overlay.autoShowPending = false
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    bridge.receive(hello())
    bridge.receive(panelToggled(open: false))

    XCTAssertEqual(allOpens(in: bridge).count, 0, "no --autoshow flag must never open the panel")
    overlay.detach()
  }

  // A panel the page reports as already open spends the one-shot without a redundant open.
  func testAutoShowSpendsItsOneShotOnAnAlreadyOpenPanel() {
    let (overlay, _) = makeOverlay(pid: 100, port: 59990)
    guard let bridge = bridge(of: overlay) else { return XCTFail("expected the bridge") }
    overlay.autoShowPending = true
    bridge.receive(.bridgeReady(BridgeReady(v: 1)))

    bridge.receive(hello())
    bridge.receive(panelToggled(open: true))
    bridge.receive(panelToggled(open: false))

    XCTAssertEqual(allOpens(in: bridge).count, 0, "an already-open panel needs no open, and the one-shot is spent")
    overlay.detach()
  }

  // MARK: discovery attachment generation (item 6)

  func testStaleDiscoveryCompletionAfterDetachDoesNotMount() {
    var pending: ((ConcivEndpoint?) -> Void)?
    ConcivWidget.discoverDriver = { _, completion in pending = completion }
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.isHidden = false

    ConcivWidget.attach(to: window)
    ConcivWidget.detach()
    pending?(ConcivEndpoint(apiBase: url("http://127.0.0.1:59990"), token: nil, pid: 1))

    XCTAssertNil(ConcivWidget.controller, "a discovery completion superseded by detach must not mount")
  }

  func testInGenerationDiscoveryCompletionMounts() {
    var pending: ((ConcivEndpoint?) -> Void)?
    ConcivWidget.discoverDriver = { _, completion in pending = completion }
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.isHidden = false

    ConcivWidget.attach(to: window)
    pending?(ConcivEndpoint(apiBase: url("http://127.0.0.1:59990"), token: nil, pid: 1))

    XCTAssertNotNil(ConcivWidget.controller, "an in-generation completion mounts the overlay")
    ConcivWidget.detach()
  }

  // MARK: windowless attach (zero-config one-liner)

  private func makeWindow() -> UIWindow {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.isHidden = false
    return window
  }

  // ConcivWidget.attach() before a key window exists (SceneDelegate before makeKeyAndVisible,
  // SwiftUI App.init) must defer and mount once a window becomes key.
  func testWindowlessAttachDefersUntilAKeyWindowActivates() {
    var provided: UIWindow?
    ConcivWidget.keyWindowProvider = { provided }
    ConcivWidget.discoverDriver = { _, completion in
      completion(ConcivEndpoint(apiBase: self.url("http://127.0.0.1:59990"), token: nil, pid: 1))
    }

    ConcivWidget.attach()
    XCTAssertNil(ConcivWidget.controller, "no key window at call time must defer the mount")

    let window = makeWindow()
    provided = window
    NotificationCenter.default.post(name: UIWindow.didBecomeKeyNotification, object: window)

    XCTAssertNotNil(ConcivWidget.controller, "window activation must resolve the deferred attach and mount")
    ConcivWidget.detach()
  }

  // A second attach supersedes a still-deferred first one: only one overlay mounts, and a
  // late activation never remounts over the live controller.
  func testWindowlessAttachGuardsAgainstADoubleMount() {
    var provided: UIWindow?
    ConcivWidget.keyWindowProvider = { provided }
    ConcivWidget.discoverDriver = { _, completion in
      completion(ConcivEndpoint(apiBase: self.url("http://127.0.0.1:59990"), token: nil, pid: 1))
    }

    ConcivWidget.attach()
    let window = makeWindow()
    provided = window
    ConcivWidget.attach()

    let mounted = ConcivWidget.controller
    XCTAssertNotNil(mounted, "the second attach resolves the now-present key window and mounts")

    NotificationCenter.default.post(name: UIWindow.didBecomeKeyNotification, object: window)
    XCTAssertTrue(ConcivWidget.controller === mounted, "a superseded deferred attach must not remount")
    ConcivWidget.detach()
  }
}
#endif
