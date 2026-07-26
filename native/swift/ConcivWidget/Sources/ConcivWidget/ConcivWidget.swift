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

  // Explicit endpoint. apiBase is the core-served native page origin
  // (http://127.0.0.1:<port>, plus /t/<token> when the core minted a token); the SDK
  // loads apiBase/native into a transparent overlay above the app's own UI. This is
  // the env-injected path: the app reads CONCIV_URL and calls attach with it.
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

  // Auto-discovery. Reads the pairing file the core wrote (the simulator shares the
  // host filesystem), falling back to probing the candidate ports on 127.0.0.1. The
  // discovered apiBase already carries /t/<token> when the core is token-scoped.
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
    controller?.detach()
    controller = nil
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
  public static func attach(
    to window: UIWindow,
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {}

  public static func attach(
    to window: UIWindow,
    launcher: ConcivLauncher = .native
  ) {}

  public static func detach() {}
  #endif
}
#endif
