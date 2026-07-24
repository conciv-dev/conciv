#if canImport(UIKit)
import UIKit
import WebKit

public enum ConcivLauncher {
  case native
  case mascot
}

// A passthrough overlay view: touches outside the live region fall through to the
// app's own UI (04 section 1). The live region is the native FAB when closed
// (launcher: native), the reported mascot frame when closed (launcher: mascot),
// or the whole panel when open (modal-when-open).
final class PassthroughContainerView: UIView {
  var pickActive = false
  var panelOpen = false
  var launcher: ConcivLauncher = .native
  var fabRect: CGRect = .zero
  var mascotRect: CGRect = .zero

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard shouldCapture(point) else { return nil }
    return super.hitTest(point, with: event)
  }

  private func shouldCapture(_ point: CGPoint) -> Bool {
    if pickActive { return true }
    if panelOpen { return true }
    if launcher == .native { return fabRect.contains(point) }
    return mascotRect.contains(point)
  }
}

final class OverlayController: NSObject {
  let container: PassthroughContainerView
  let webView: WKWebView
  private let fab = UIButton(type: .system)
  private let bridge: BridgeHandler
  private let pageUrl: URL
  private var apiBaseOrigin: String
  private var token: String?
  private weak var hostWindow: UIWindow?

  private(set) var endpoint: ConcivEndpoint
  // Fired when the current base is unrecoverable from inside this controller (a stale
  // token surfaced through the re-pair prompt). The owner re-discovers and decides
  // rebind (same core) vs fresh mount (different core).
  var onEndpointLost: (() -> Void)?

  private var launcher: ConcivLauncher = .native
  private var panelOpen = false
  private var pickOverlay: PickOverlayView?
  private var pickRequestId: String?
  private var highlight: UIView?
  private var repairPrompt: UIView?

  init(hostWindow: UIWindow, endpoint: ConcivEndpoint, launcher: ConcivLauncher) {
    self.hostWindow = hostWindow
    self.endpoint = endpoint
    self.pageUrl = ConcivDiscovery.pageURL(for: endpoint.apiBase)
    self.apiBaseOrigin = ConcivDiscovery.origin(of: endpoint.apiBase)
    self.token = endpoint.token
    self.launcher = launcher

    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []

    let bounds = hostWindow.bounds
    container = PassthroughContainerView(frame: bounds)
    container.backgroundColor = .clear
    container.launcher = launcher

    webView = WKWebView(frame: bounds, configuration: configuration)
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.scrollView.isOpaque = false
    webView.allowsBackForwardNavigationGestures = false
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    #if DEBUG
    if #available(iOS 16.4, *) { webView.isInspectable = true }
    #endif

    bridge = BridgeHandler(webView: webView, coreOrigin: endpoint.apiBase)
    super.init()

    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.addSubview(webView)
    configureFab()
    container.addSubview(fab)
    hostWindow.addSubview(container)

    wireBridge()
    observeKeyboard()
    webView.load(URLRequest(url: pageUrl))
  }

  func detach() {
    bridge.detach()
    NotificationCenter.default.removeObserver(self)
    container.removeFromSuperview()
  }

  // Same-core port drift (06 D8): keep the live document, re-point its data plane by
  // re-sending the handshake with the new origin. The origin pin is unchanged because
  // the loaded document is still same-origin; only a different core (fresh mount)
  // rebuilds this controller with a new pin.
  func rebind(to endpoint: ConcivEndpoint) {
    self.endpoint = endpoint
    self.apiBaseOrigin = ConcivDiscovery.origin(of: endpoint.apiBase)
    self.token = endpoint.token
    hideRepairPrompt()
    bridge.sendHandshake(apiBase: apiBaseOrigin, token: token)
  }

  // MARK: FAB (launcher: native)

  private func configureFab() {
    fab.isHidden = launcher != .native
    fab.setTitle("AI", for: .normal)
    fab.setTitleColor(.white, for: .normal)
    fab.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
    fab.layer.cornerRadius = 28
    fab.frame = fabFrame()
    fab.autoresizingMask = [.flexibleTopMargin, .flexibleLeftMargin]
    fab.addTarget(self, action: #selector(fabTapped), for: .touchUpInside)
    container.fabRect = fab.frame
  }

  private func fabFrame() -> CGRect {
    let size: CGFloat = 56
    let inset: CGFloat = 20
    let safe = container.safeAreaInsets
    let x = container.bounds.width - size - inset - safe.right
    let y = container.bounds.height - size - inset - safe.bottom
    return CGRect(x: x, y: y, width: size, height: size)
  }

  @objc private func fabTapped() {
    if panelOpen {
      bridge.sendClose()
    } else {
      bridge.sendOpen()
    }
  }

  // MARK: bridge wiring

  private func wireBridge() {
    bridge.onHandshakeHello = { [weak self] hello in self?.handleHello(hello) }
    bridge.onGrabPick = { [weak self] pick in self?.startPick(pick) }
    bridge.onGrabCancel = { [weak self] cancel in self?.cancelPick(cancel.requestId) }
    bridge.onPanelToggled = { [weak self] toggled in self?.handlePanelToggled(toggled) }
    bridge.onCrashRecovery = { [weak self] in self?.resolvePick(requestId: self?.pickRequestId, grab: nil) }
    bridge.onStaleToken = { [weak self] in self?.showRepairPrompt() }
  }

  // MARK: re-pair prompt (SDK-owned, 06 D13)

  // A stale token (401/404) means the paired core moved to a new /t/<newtoken> mount.
  // There is no silent refresh, so surface a visible prompt; tapping it re-discovers.
  private func showRepairPrompt() {
    guard repairPrompt == nil else { return }
    let banner = UIView(frame: repairPromptFrame())
    banner.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
    banner.backgroundColor = UIColor(red: 0.50, green: 0.11, blue: 0.11, alpha: 1)

    let label = UILabel()
    label.text = "conciv lost the dev core. Tap to re-pair."
    label.textColor = .white
    label.font = .systemFont(ofSize: 14, weight: .medium)
    label.numberOfLines = 0

    let button = UIButton(type: .system)
    button.setTitle("Re-pair", for: .normal)
    button.setTitleColor(.white, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
    button.addTarget(self, action: #selector(repairTapped), for: .touchUpInside)

    let stack = UIStackView(arrangedSubviews: [label, button])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    banner.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: banner.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: banner.trailingAnchor, constant: -16),
      stack.centerYAnchor.constraint(equalTo: banner.centerYAnchor),
    ])

    container.addSubview(banner)
    container.panelOpen = true
    repairPrompt = banner
  }

  private func hideRepairPrompt() {
    repairPrompt?.removeFromSuperview()
    repairPrompt = nil
    container.panelOpen = panelOpen
  }

  private func repairPromptFrame() -> CGRect {
    let height: CGFloat = 64
    let top = container.safeAreaInsets.top
    return CGRect(x: 0, y: top, width: container.bounds.width, height: height)
  }

  @objc private func repairTapped() {
    hideRepairPrompt()
    onEndpointLost?()
  }

  private func handleHello(_ hello: HandshakeHello) {
    let overlaps = hello.minV <= bridgeMaxVersion && bridgeMinVersion <= hello.maxV
    if overlaps {
      bridge.sendHandshake(apiBase: apiBaseOrigin, token: token)
    } else {
      bridge.sendIncompatible(nativeMinV: bridgeMinVersion, nativeMaxV: bridgeMaxVersion)
    }
  }

  private func handlePanelToggled(_ toggled: HostPanelToggled) {
    panelOpen = toggled.open
    container.panelOpen = toggled.open
    if let rect = toggled.mascotRect {
      container.mascotRect = CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
    }
    fab.isHidden = launcher != .native
  }

  // MARK: pick mode

  private func startPick(_ pick: GrabPick) {
    resolvePick(requestId: pickRequestId, grab: nil)
    pickRequestId = pick.requestId
    let overlay = PickOverlayView(frame: container.bounds)
    overlay.backgroundColor = UIColor.black.withAlphaComponent(0.001)
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.onMove = { [weak self] point in self?.updateHighlight(at: point) }
    overlay.onSelect = { [weak self] point in self?.performPick(at: point) }
    container.addSubview(overlay)
    container.pickActive = true
    pickOverlay = overlay
  }

  private func cancelPick(_ requestId: String) {
    guard pickRequestId == requestId else { return }
    resolvePick(requestId: requestId, grab: nil)
  }

  private func exitPick() {
    highlight?.removeFromSuperview()
    highlight = nil
    pickOverlay?.removeFromSuperview()
    pickOverlay = nil
    container.pickActive = false
  }

  private func hostRootView() -> UIView? {
    hostWindow?.rootViewController?.view ?? hostWindow
  }

  private func isExcluded(_ view: UIView) -> Bool {
    view === container || view.isDescendant(of: container)
  }

  private func performPick(at point: CGPoint) {
    let requestId = pickRequestId
    if !Capture.isActiveForCapture() {
      resolvePick(requestId: requestId, grab: nil)
      return
    }
    if let anchor = ConcivAnchorRegistry.shared.hitTest(point) {
      let image = Capture.renderHostView(hostRootView() ?? container, cropTo: anchor.frame)
      let grab = pickNeutralGrab(fromAnchor: anchor, registry: ConcivAnchorRegistry.shared, image: image)
      resolvePick(requestId: requestId, grab: grab)
      return
    }
    guard let root = hostRootView(),
          let picked = pickSearch(from: root, at: point, isExcluded: { [weak self] in self?.isExcluded($0) ?? false })
    else {
      resolvePick(requestId: requestId, grab: nil)
      return
    }
    let image = Capture.renderView(picked)
    let grab = pickNeutralGrab(fromUIView: picked, isExcluded: { [weak self] in self?.isExcluded($0) ?? false }, image: image)
    resolvePick(requestId: requestId, grab: grab)
  }

  private func resolvePick(requestId: String?, grab: NeutralGrab?) {
    guard let requestId, requestId == pickRequestId else {
      exitPick()
      return
    }
    pickRequestId = nil
    exitPick()
    bridge.sendGrabResult(requestId: requestId, grab: grab)
  }

  private func updateHighlight(at point: CGPoint) {
    guard let root = hostRootView() else { return }
    let anchorFrame = ConcivAnchorRegistry.shared.hitTest(point)?.frame
    let viewFrame = pickSearch(from: root, at: point, isExcluded: { [weak self] in self?.isExcluded($0) ?? false }).map { pickFrameInWindow($0) }
    guard let frame = anchorFrame ?? viewFrame else { return }
    let box = highlight ?? makeHighlight()
    box.frame = frame
  }

  private func makeHighlight() -> UIView {
    let box = UIView()
    box.isUserInteractionEnabled = false
    box.layer.borderColor = UIColor.systemBlue.cgColor
    box.layer.borderWidth = 2
    box.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.15)
    pickOverlay?.addSubview(box)
    highlight = box
    return box
  }

  // MARK: keyboard avoidance + safe area (04 section 1b)

  private func observeKeyboard() {
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(keyboardWillShow(_:)), name: UIResponder.keyboardWillShowNotification, object: nil)
    center.addObserver(self, selector: #selector(keyboardWillHide(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
  }

  // WKWebView does not inset overlay content for the keyboard; we drive the web
  // scroll view's bottom content inset so the composer stays above the keyboard
  // rather than resizing the panel container.
  @objc private func keyboardWillShow(_ note: Notification) {
    guard let frameValue = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue else { return }
    let keyboardFrame = frameValue.cgRectValue
    let overlap = max(0, container.bounds.maxY - keyboardFrame.origin.y)
    webView.scrollView.contentInset.bottom = overlap
    webView.scrollView.verticalScrollIndicatorInsets.bottom = overlap
  }

  @objc private func keyboardWillHide(_ note: Notification) {
    webView.scrollView.contentInset.bottom = 0
    webView.scrollView.verticalScrollIndicatorInsets.bottom = 0
  }
}
#endif
