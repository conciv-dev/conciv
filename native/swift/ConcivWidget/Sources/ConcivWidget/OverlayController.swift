#if canImport(UIKit)
import UIKit
import WebKit

// A passthrough overlay view: touches outside the live region fall through to the
// app's own UI (04 section 1). The live region is the native FAB when closed
// (launcher: native), the reported mascot frame when closed (launcher: mascot),
// or the whole panel when open (modal-when-open). Capture is derived from the
// state's open flag via liveRegion(), never from whichever rect was written last.
final class PassthroughContainerView: UIView {
  var pickActive = false
  var state = LiveRegionState()
  var onLayout: (() -> Void)?

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let region = liveRegion(state, pickActive: pickActive)
    let captured = region.captures(point)
    guard captured else { return nil }
    return super.hitTest(point, with: event)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onLayout?()
  }
}

// The FAB frame is a pure function of the container geometry so it can be recomputed
// on every layout pass (the safe-area insets are zero until the container is attached
// to a window) and pinned in a test.
func fabFrame(in bounds: CGRect, safeArea: UIEdgeInsets, size: CGFloat = 56, inset: CGFloat = 20) -> CGRect {
  let x = bounds.width - size - inset - safeArea.right
  let y = bounds.height - size - inset - safeArea.bottom
  return CGRect(x: x, y: y, width: size, height: size)
}

// Keyboard overlap for the web scroll view, computed once the keyboard frame is in the
// container's own coordinate space. The intersection height is the amount the keyboard
// covers the container, zero when they do not overlap.
func keyboardOverlap(keyboardInContainer: CGRect, containerBounds: CGRect) -> CGFloat {
  let intersection = keyboardInContainer.intersection(containerBounds)
  return intersection.isNull ? 0 : intersection.height
}

final class OverlayController: NSObject {
  let container: PassthroughContainerView
  let webView: WKWebView
  private let fab = UIButton(type: .system)
  private let bridge: BridgeHandler
  private var pageUrl: URL
  private weak var hostWindow: UIWindow?

  private(set) var endpoint: ConcivEndpoint
  // Runs one discovery pass off the main thread and reports the resolved endpoint (or
  // nil) back on the main thread. Injected by the owner so it reuses the same discoverer
  // as the initial attach; the controller decides rebind vs fresh-mount from the result.
  var onDiscover: ((@escaping (ConcivEndpoint?) -> Void) -> Void)?
  // A different core (changed pid) was rediscovered: the owner tears this controller down
  // and mounts a fresh one at the new endpoint (never a rebind, 06 D8).
  var onDifferentCore: ((ConcivEndpoint) -> Void)?

  // Bounded exponential backoff for the rediscovery loop (04): 1s, 2s, 4s, 8s, 8s, then
  // give up auto-retry (the prompt stays for a manual Re-pair). Overridable in tests.
  var recoveryDelays: [TimeInterval] = [1, 2, 4, 8, 8]
  private var recovering = false
  private var recoveryAttempt = 0
  private var recoveryWork: DispatchWorkItem?

  private var launcher: ConcivLauncher = .native
  private var panelOpen = false
  private var pickOverlay: PickOverlayView?
  private var pickRequestId: String?
  private var flashWork: DispatchWorkItem?
  private var highlight: UIView?
  private var pickBanner: UIView?
  private var pickBorder: UIView?
  private var selectionInFlight = false
  private var repairPrompt: UIView?
  private var repairLabel: UILabel?
  private var autoShowPending = ConcivDiscovery.shouldAutoShow()

  init(hostWindow: UIWindow, endpoint: ConcivEndpoint, launcher: ConcivLauncher) {
    self.hostWindow = hostWindow
    self.endpoint = endpoint
    self.launcher = launcher
    self.pageUrl = OverlayController.makePageURL(for: endpoint.apiBase, launcher: launcher)

    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []

    let bounds = hostWindow.bounds
    container = PassthroughContainerView(frame: bounds)
    container.backgroundColor = .clear
    container.state.launcher = launcher

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
    container.onLayout = { [weak self] in self?.layoutChrome() }
    hostWindow.addSubview(container)

    wireBridge()
    observeKeyboard()
    webView.load(URLRequest(url: pageUrl))
  }

  func detach() {
    stopRecoveryLoop()
    if ConcivAnchorRegistry.shared.onChange != nil { ConcivAnchorRegistry.shared.onChange = nil }
    bridge.detach()
    NotificationCenter.default.removeObserver(self)
    container.removeFromSuperview()
  }

  // The launcher choice reaches the served page as a query param: the native page's
  // entry reads ?launcher=mascot and renders the web ShellFab mascot instead of
  // deferring to the native FAB. Native mode loads the page with no query.
  private static func makePageURL(for apiBase: URL, launcher: ConcivLauncher) -> URL {
    let base = ConcivDiscovery.pageURL(for: apiBase)
    guard launcher == .mascot else { return base }
    guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return base }
    components.queryItems = [URLQueryItem(name: "launcher", value: "mascot")]
    return components.url ?? base
  }

  // Same-core port drift (06 D8): the core moved to a new base, so re-point the document
  // plane at it. Recompute the page URL and re-pin the bridge origin to the new base (the
  // base carries the /t/<token> prefix when token-scoped), then reload so the document is
  // served from, and its bridge messages are accepted at, the live origin. Restage the
  // stored handshake at the new base before the load so the reload's bridge.ready resend
  // carries the live base, not the dead one; the fresh hello then re-confirms it. A
  // different core (fresh mount) rebuilds this controller.
  func rebind(to endpoint: ConcivEndpoint) {
    stopRecoveryLoop()
    self.endpoint = endpoint
    self.pageUrl = OverlayController.makePageURL(for: endpoint.apiBase, launcher: launcher)
    bridge.rebind(to: endpoint.apiBase)
    bridge.restageHandshake(apiBase: endpoint.apiBase.absoluteString, token: endpoint.token)
    hideRepairPrompt()
    webView.load(URLRequest(url: pageUrl))
  }

  // The handshake apiBase is the full base (origin plus any /t/<token> prefix), which
  // equals the served page's own bound base so no spurious rebind fires.
  private func sendHandshake() {
    bridge.sendHandshake(apiBase: endpoint.apiBase.absoluteString, token: endpoint.token)
  }

  // MARK: FAB (launcher: native)

  private func configureFab() {
    fab.isHidden = fabHidden(launcher: launcher, panelOpen: panelOpen)
    fab.setTitle("AI", for: .normal)
    fab.accessibilityLabel = "Open conciv chat"
    fab.setTitleColor(.white, for: .normal)
    fab.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
    fab.layer.cornerRadius = 28
    fab.frame = currentFabFrame()
    fab.autoresizingMask = [.flexibleTopMargin, .flexibleLeftMargin]
    fab.addTarget(self, action: #selector(fabTapped), for: .touchUpInside)
    container.state.fabRect = fab.frame
  }

  private func currentFabFrame() -> CGRect {
    fabFrame(in: container.bounds, safeArea: container.safeAreaInsets)
  }

  // Re-seat the overlay's own chrome and its recorded live-region rects from a layout pass:
  // at init the container is not yet in a window so its safe-area insets are zero, which
  // would leave the FAB in the home-indicator strip and the LiveRegion hit rects diverging
  // from the button and the re-pair banner after rotation or a safe-area change.
  private func layoutChrome() {
    let frame = currentFabFrame()
    fab.frame = frame
    container.state.fabRect = frame
    guard let banner = repairPrompt else { return }
    let bannerFrame = repairPromptFrame()
    banner.frame = bannerFrame
    container.state.bannerRect = bannerFrame
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
    bridge.onCrashRecovery = { [weak self] in self?.resolvePick(requestId: self?.pickRequestId, grab: nil, reason: .failed) }
    bridge.onStaleToken = { [weak self] in self?.startRecoveryLoop() }
    bridge.onConnectionLost = { [weak self] in self?.startRecoveryLoop() }
    bridge.onReady = { [weak self] in self?.handleBridgeReady() }
    bridge.onLog = { log in Swift.print("[conciv] \(log.level.rawValue): \(log.message)") }
    ConcivAnchorRegistry.shared.onChange = { [weak self] in self?.sendGrabCapability() }
  }

  // Grab is available when the screen has something to select: any SwiftUI anchor, or any
  // interesting UIKit view under the host. Sent once the handshake settles and again each
  // time the anchor set changes.
  private func sendGrabCapability() {
    bridge.sendGrabCapability(hostHasPickableContent())
  }

  private func hostHasPickableContent() -> Bool {
    if !ConcivAnchorRegistry.shared.all.isEmpty { return true }
    guard let root = hostRootView() else { return false }
    return containsInterestingView(root)
  }

  private func containsInterestingView(_ view: UIView) -> Bool {
    for child in view.subviews {
      if !pickIsVisible(child) { continue }
      if isExcluded(child) { continue }
      if pickIsInteresting(child) { return true }
      if containsInterestingView(child) { return true }
    }
    return false
  }

  // MARK: re-pair prompt + bounded rediscovery (SDK-owned, 04/06 D13)

  enum RepairPromptState {
    case searching
    case unreachable
    case gaveUp

    var message: String {
      switch self {
      case .searching: return "conciv lost the dev core. Reconnecting…"
      case .unreachable: return "Still can't reach the dev core. Retrying…"
      case .gaveUp: return "Still can't reach the dev core. Tap to retry."
      }
    }
  }

  var isRepairPromptVisible: Bool { repairPrompt != nil }

  // A stale token (401/404) or a connection refusal means the current base is dead. Start
  // one bounded rediscovery loop: surface a visible prompt (never a silent brick) and
  // retry discovery on exponential backoff. A live loop is not restarted so overlapping
  // triggers (stale token then a nav failure) collapse into one.
  private func startRecoveryLoop() {
    guard !recovering else { return }
    recovering = true
    recoveryAttempt = 0
    showRepairPrompt(state: .searching)
    scheduleRecoveryAttempt()
  }

  private func stopRecoveryLoop() {
    recovering = false
    recoveryAttempt = 0
    recoveryWork?.cancel()
    recoveryWork = nil
  }

  private func scheduleRecoveryAttempt() {
    guard recovering, !recoveryDelays.isEmpty else { return }
    let index = min(recoveryAttempt, recoveryDelays.count - 1)
    let work = DispatchWorkItem { [weak self] in self?.runRecoveryAttempt() }
    recoveryWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + recoveryDelays[index], execute: work)
  }

  private func runRecoveryAttempt() {
    guard recovering else { return }
    recoveryAttempt += 1
    updateRepairPrompt(state: .searching)
    onDiscover? { [weak self] discovered in
      guard let self, self.recovering else { return }
      guard let discovered else {
        self.handleRecoveryUnreachable()
        return
      }
      // Same core (pid unchanged) re-points the live page (D8 rebind); a different core is
      // a fresh mount at the new origin. rebind() stops this loop; the fresh mount detaches
      // this controller, so its loop stops via detach().
      if ConcivDiscovery.isSameCore(previous: self.endpoint, discovered: discovered) {
        self.rebind(to: discovered)
      } else {
        self.stopRecoveryLoop()
        self.onDifferentCore?(discovered)
      }
    }
  }

  // No reachable core this attempt: keep the prompt visible (no dead-end). Retry until the
  // backoff budget is spent, then leave the prompt in a tappable "tap to retry" state so a
  // manual Re-pair restarts the loop.
  private func handleRecoveryUnreachable() {
    guard recovering else { return }
    guard recoveryAttempt < recoveryDelays.count else {
      recovering = false
      recoveryWork?.cancel()
      recoveryWork = nil
      updateRepairPrompt(state: .gaveUp)
      return
    }
    updateRepairPrompt(state: .unreachable)
    scheduleRecoveryAttempt()
  }

  // A fresh bridge is up (initial load, or a completed rebind/remount reload): recovery
  // succeeded, so stop retrying and drop the prompt. Idempotent on a normal first load.
  private func handleBridgeReady() {
    stopRecoveryLoop()
    hideRepairPrompt()
  }

  // The prompt gets its own bounded hit region (bannerRect), never the whole-panel one: a
  // prompt that survives a spent backoff budget would otherwise make the transparent
  // WKWebView swallow every touch in the window and brick the host app. Touches outside the
  // banner frame keep falling through to the app while the prompt stays tappable.
  private func showRepairPrompt(state: RepairPromptState) {
    guard repairPrompt == nil else {
      updateRepairPrompt(state: state)
      return
    }
    let banner = UIView(frame: repairPromptFrame())
    banner.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
    banner.backgroundColor = UIColor(red: 0.50, green: 0.11, blue: 0.11, alpha: 1)

    let label = UILabel()
    label.text = state.message
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
    container.state.bannerRect = banner.frame
    repairPrompt = banner
    repairLabel = label
  }

  private func updateRepairPrompt(state: RepairPromptState) {
    repairLabel?.text = state.message
  }

  private func hideRepairPrompt() {
    repairPrompt?.removeFromSuperview()
    repairPrompt = nil
    repairLabel = nil
    container.state.bannerRect = nil
  }

  private func repairPromptFrame() -> CGRect {
    let height: CGFloat = 64
    let top = container.safeAreaInsets.top
    return CGRect(x: 0, y: top, width: container.bounds.width, height: height)
  }

  // Manual Re-pair: restart the bounded loop from the first backoff step. The prompt stays
  // visible until recovery completes or the fresh bridge readies.
  @objc private func repairTapped() {
    stopRecoveryLoop()
    startRecoveryLoop()
  }

  private func handleHello(_ hello: HandshakeHello) {
    guard let agreed = BridgeNegotiation.negotiatedVersion(helloMinV: hello.minV, helloMaxV: hello.maxV) else {
      bridge.sendIncompatible(nativeMinV: bridgeMinVersion, nativeMaxV: bridgeMaxVersion)
      return
    }
    bridge.setNegotiatedVersion(agreed)
    sendHandshake()
    sendGrabCapability()
    autoShowIfRequested()
  }

  // ios.run --autoshow drives the panel open once the handshake has settled. The open is
  // enqueued after the handshake so it reaches the page in order, and the one-shot flag
  // keeps a later reload or rebind from re-opening a panel the user has since closed.
  private func autoShowIfRequested() {
    guard autoShowPending, !panelOpen else { return }
    autoShowPending = false
    bridge.sendOpen()
  }

  private func handlePanelToggled(_ toggled: HostPanelToggled) {
    panelOpen = toggled.open
    let incoming = toggled.mascotRect.map { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height) }
    container.state = applyPanelToggle(container.state, open: toggled.open, mascotRect: incoming)
    fab.isHidden = fabHidden(launcher: launcher, panelOpen: toggled.open)
    fab.accessibilityLabel = toggled.open ? "Minimize conciv chat" : "Open conciv chat"
  }

  // MARK: pick mode

  private func startPick(_ pick: GrabPick) {
    flashWork?.cancel()
    flashWork = nil
    resolvePick(requestId: pickRequestId, grab: nil, reason: .cancelled)
    let requestId = pick.requestId
    pickRequestId = requestId
    let overlay = PickOverlayView(frame: container.bounds)
    overlay.backgroundColor = UIColor.black.withAlphaComponent(0.001)
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.onMove = { [weak self] point in self?.updateHighlight(at: point) }
    overlay.onSelect = { [weak self] point in self?.performPick(at: point) }
    overlay.onCancel = { [weak self] in self?.resolvePick(requestId: requestId, grab: nil, reason: .cancelled) }
    container.addSubview(overlay)
    container.pickActive = true
    pickOverlay = overlay
    installPickChrome(on: overlay)
  }

  private func cancelPick(_ requestId: String) {
    guard pickRequestId == requestId else { return }
    resolvePick(requestId: requestId, grab: nil, reason: .cancelled)
  }

  @objc private func pickCancelTapped() {
    resolvePick(requestId: pickRequestId, grab: nil, reason: .cancelled)
  }

  private func exitPick() {
    flashWork?.cancel()
    flashWork = nil
    highlight?.removeFromSuperview()
    highlight = nil
    pickBanner = nil
    pickBorder = nil
    selectionInFlight = false
    pickOverlay?.removeFromSuperview()
    pickOverlay = nil
    container.pickActive = false
  }

  // Selection-mode chrome (05 D9): a full-screen accent border and a top pill both make
  // clear the user is picking, not driving the app. Both live on the pick overlay so
  // exitPick tears them down with the overlay. The border is non-interactive; the pill
  // swallows its own touches (PickBannerView) so tapping it never picks the element
  // underneath, and its close button reaches through the overlay's tap layer.
  private func installPickChrome(on overlay: PickOverlayView) {
    let border = UIView(frame: overlay.bounds)
    border.isUserInteractionEnabled = false
    border.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    border.layer.borderColor = UIColor.systemBlue.withAlphaComponent(0.8).cgColor
    border.layer.borderWidth = 3
    overlay.addSubview(border)
    pickBorder = border

    let banner = PickBannerView()
    banner.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
    banner.layer.cornerRadius = 18
    banner.translatesAutoresizingMaskIntoConstraints = false

    let label = UILabel()
    label.text = "Tap an element to attach"
    label.textColor = .white
    label.font = .systemFont(ofSize: 14, weight: .medium)

    let close = UIButton(type: .system)
    close.setTitle("✕", for: .normal)
    close.accessibilityLabel = "Cancel selection"
    close.setTitleColor(.white, for: .normal)
    close.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
    close.addTarget(self, action: #selector(pickCancelTapped), for: .touchUpInside)
    close.setContentHuggingPriority(.required, for: .horizontal)

    let stack = UIStackView(arrangedSubviews: [label, close])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 12
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 12)
    stack.translatesAutoresizingMaskIntoConstraints = false
    banner.addSubview(stack)
    overlay.addSubview(banner)

    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: banner.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: banner.trailingAnchor),
      stack.topAnchor.constraint(equalTo: banner.topAnchor),
      stack.bottomAnchor.constraint(equalTo: banner.bottomAnchor),
      banner.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
      banner.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 12),
    ])
    pickBanner = banner
  }

  private func hostRootView() -> UIView? {
    hostWindow?.rootViewController?.view ?? hostWindow
  }

  private func isExcluded(_ view: UIView) -> Bool {
    view === container || view.isDescendant(of: container)
  }

  private func performPick(at point: CGPoint) {
    guard !selectionInFlight else { return }
    let requestId = pickRequestId
    if !Capture.isActiveForCapture() {
      resolvePick(requestId: requestId, grab: nil, reason: .failed)
      return
    }
    if let anchor = ConcivAnchorRegistry.shared.hitTest(point) {
      let image = Capture.renderHostView(hostRootView() ?? container, cropTo: anchor.frame)
      guard let preview = Capture.imagePreview(image) else {
        resolvePick(requestId: requestId, grab: nil, reason: .failed)
        return
      }
      let grab = pickNeutralGrab(fromAnchor: anchor, registry: ConcivAnchorRegistry.shared, preview: preview)
      flashThenResolve(requestId: requestId, grab: grab, frame: anchor.frame)
      return
    }
    guard let root = hostRootView(),
          let picked = pickSearch(from: root, at: point, isExcluded: { [weak self] in self?.isExcluded($0) ?? false })
    else {
      resolvePick(requestId: requestId, grab: nil, reason: .failed)
      return
    }
    guard let preview = Capture.imagePreview(Capture.renderView(picked)) else {
      resolvePick(requestId: requestId, grab: nil, reason: .failed)
      return
    }
    let grab = pickNeutralGrab(fromUIView: picked, isExcluded: { [weak self] in self?.isExcluded($0) ?? false }, preview: preview)
    flashThenResolve(requestId: requestId, grab: grab, frame: pickFrameInWindow(picked))
  }

  // Confirmation flash (05 D9): the highlight rect over the picked element blinks for a
  // beat before the result is sent, so the tap reads as a deliberate selection. The flash
  // lives on the pick overlay, never in the captured image (capture already ran against
  // the host view above). selectionInFlight ignores a second tap until the pick exits.
  private func flashThenResolve(requestId: String?, grab: NeutralGrab, frame: CGRect) {
    selectionInFlight = true
    let box = highlight ?? makeHighlight()
    box.frame = frame
    let work = DispatchWorkItem { [weak self] in self?.resolvePick(requestId: requestId, grab: grab, reason: nil) }
    flashWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
  }

  private func resolvePick(requestId: String?, grab: NeutralGrab?, reason: GrabResultReason?) {
    guard let requestId, requestId == pickRequestId else {
      exitPick()
      return
    }
    pickRequestId = nil
    exitPick()
    bridge.sendGrabResult(requestId: requestId, grab: grab, reason: reason)
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
    let keyboardInContainer = container.convert(frameValue.cgRectValue, from: nil)
    let overlap = keyboardOverlap(keyboardInContainer: keyboardInContainer, containerBounds: container.bounds)
    webView.scrollView.contentInset.bottom = overlap
    webView.scrollView.verticalScrollIndicatorInsets.bottom = overlap
  }

  @objc private func keyboardWillHide(_ note: Notification) {
    webView.scrollView.contentInset.bottom = 0
    webView.scrollView.verticalScrollIndicatorInsets.bottom = 0
    // The keyboard push can leave the scroll view offset even though the page never
    // scrolls natively (the panel scrolls in CSS). A stale offset shifts the whole
    // rendered page, hiding fixed-position UI like the mascot launcher.
    webView.scrollView.setContentOffset(.zero, animated: false)
  }
}
#endif
