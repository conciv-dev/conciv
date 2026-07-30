#if canImport(UIKit)
import UIKit

// Public entry point. In a Release build attach/detach are no-ops: no OverlayController,
// BridgeHandler, WebView, or dev-core URL is ever instantiated, and .concivGrab is inert
// (its modifier body is #if DEBUG, 04 D14/M-A10). The supporting UIKit types still compile
// behind canImport(UIKit) but stay unreachable. Ship a Release configuration for any
// TestFlight/App Store build.
public enum ConcivWidget {
  #if DEBUG
  static private(set) var controller: OverlayController?
  private static let discoverer = ConcivDiscoveryRuntime.makeDiscoverer()

  // Every attach/detach bumps the attachment generation; an async discovery pass captures
  // the generation it started under and no-ops if a newer attach or a detach superseded it,
  // so a late completion can never mount a stale endpoint over the caller's newer action.
  private static var attachGeneration = 0

  // The discovery driver seam: production runs the FileManager + URLSession pass off the
  // main thread; tests inject a driver whose completion they fire on demand to interleave
  // detach/attach against an in-flight discovery.
  static var discoverDriver: (ConcivDiscoverer, @escaping (ConcivEndpoint?) -> Void) -> Void =
    ConcivDiscoveryRuntime.discover

  // The key-window source for the windowless entry points. Production scans the connected
  // scenes; tests inject a fake so a deferred-then-activated attach is drivable off-device,
  // then restore defaultKeyWindowProvider.
  static let defaultKeyWindowProvider: () -> UIWindow? = ConcivWidget.foregroundKeyWindow
  static var keyWindowProvider: () -> UIWindow? = ConcivWidget.defaultKeyWindowProvider

  // The pending window observation for a deferred windowless attach. A re-attach replaces
  // it (the old resolver deinits and unregisters), so only the newest attach can mount.
  private static var windowResolver: ConcivWindowResolver?

  // The zero-config entry: ConcivWidget.attach() with no arguments. Resolves the key window
  // itself (now, or on the next window/scene activation) so it is callable from a
  // SceneDelegate before makeKeyAndVisible or a SwiftUI App.init, then reads CONCIV_URL for
  // an env-injected api base and falls back to pairing-file auto-discovery when it is unset
  // or malformed. This is the whole consumer contract in one line.
  @MainActor
  public static func attach(launcher: ConcivLauncher = .native) {
    attachViaWindow { window, generation in
      mountEnvOrDiscovered(to: window, generation: generation, launcher: launcher)
    }
  }

  // Explicit endpoint, windowless. apiBase is the core-served native page origin
  // (http://127.0.0.1:<port>, plus /t/<token> when the core minted a token); the SDK loads
  // apiBase/native into a transparent overlay above the app's own UI once the key window
  // resolves.
  @MainActor
  public static func attach(
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {
    attachViaWindow { window, _ in
      mount(to: window, endpoint: ConcivEndpoint(apiBase: apiBase, token: token, pid: nil), launcher: launcher)
    }
  }

  // Explicit endpoint against a caller-supplied window (advanced hosts that own their window
  // lifecycle). The windowless attach(apiBase:) covers the common case.
  @MainActor
  public static func attach(
    to window: UIWindow,
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {
    attachGeneration += 1
    mount(to: window, endpoint: ConcivEndpoint(apiBase: apiBase, token: token, pid: nil), launcher: launcher)
  }

  // Auto-discovery against a caller-supplied window. Reads the pairing file the core wrote
  // (the simulator shares the host filesystem), falling back to probing the candidate ports
  // on 127.0.0.1. The discovered apiBase already carries /t/<token> when the core is
  // token-scoped.
  @MainActor
  public static func attach(
    to window: UIWindow,
    launcher: ConcivLauncher = .native
  ) {
    attachGeneration += 1
    let generation = attachGeneration
    discoverDriver(discoverer) { endpoint in
      guard generation == attachGeneration, let endpoint else { return }
      mount(to: window, endpoint: endpoint, launcher: launcher)
    }
  }

  @MainActor
  public static func detach() {
    attachGeneration += 1
    windowResolver = nil
    controller?.detach()
    controller = nil
  }

  // Bumps the generation, resolves the key window (sync or on activation), and hands the
  // resolved window plus the captured generation to the caller. A newer attach or a detach
  // bumps the generation and replaces the resolver, so a stale resolution is dropped by the
  // generation guard and never mounts.
  @MainActor
  private static func attachViaWindow(_ resolve: @escaping (UIWindow, Int) -> Void) {
    attachGeneration += 1
    let generation = attachGeneration
    let resolver = ConcivWindowResolver(keyWindow: keyWindowProvider) { window in
      guard generation == attachGeneration else { return }
      windowResolver = nil
      resolve(window, generation)
    }
    windowResolver = resolver
    resolver.start()
  }

  @MainActor
  private static func mountEnvOrDiscovered(to window: UIWindow, generation: Int, launcher: ConcivLauncher) {
    if let apiBase = ConcivDiscovery.envApiBase() {
      mount(to: window, endpoint: ConcivEndpoint(apiBase: apiBase, token: nil, pid: nil), launcher: launcher)
      return
    }
    discoverDriver(discoverer) { endpoint in
      guard generation == attachGeneration, let endpoint else { return }
      mount(to: window, endpoint: endpoint, launcher: launcher)
    }
  }

  private static func foregroundKeyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let active = scenes.first(where: { $0.activationState == .foregroundActive }), let key = active.keyWindow {
      return key
    }
    for scene in scenes where scene.keyWindow != nil {
      return scene.keyWindow
    }
    return nil
  }

  @MainActor
  private static func mount(to window: UIWindow, endpoint: ConcivEndpoint, launcher: ConcivLauncher) {
    detach()
    let overlay = OverlayController(hostWindow: window, endpoint: endpoint, launcher: launcher)
    // The recovery loop asks for a rediscovery pass; the controller decides rebind (same
    // core) vs handing a different core back here for a fresh mount at the new origin (D8).
    overlay.onDiscover = { completion in discoverDriver(discoverer, completion) }
    overlay.onDifferentCore = { [weak window, weak overlay] discovered in
      guard let window, controller === overlay else { return }
      mount(to: window, endpoint: discovered, launcher: launcher)
    }
    controller = overlay
  }
  #else
  @MainActor
  public static func attach(launcher: ConcivLauncher = .native) {}

  @MainActor
  public static func attach(
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {}

  @MainActor
  public static func attach(
    to window: UIWindow,
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {}

  @MainActor
  public static func attach(
    to window: UIWindow,
    launcher: ConcivLauncher = .native
  ) {}

  @MainActor
  public static func detach() {}
  #endif
}
#endif
