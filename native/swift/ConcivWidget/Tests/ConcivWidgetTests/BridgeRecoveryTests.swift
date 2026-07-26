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
    super.tearDown()
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
}
#endif
