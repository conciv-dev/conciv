#if canImport(UIKit)
import UIKit

// Public entry point. Everything is #if DEBUG so no bridge code, WebView, or the
// dev-core URL compiles into a Release build (04 D14/M-A10). In Release, attach is
// a no-op; ship a Release configuration for any TestFlight/App Store build.
public enum ConcivWidget {
  #if DEBUG
  private static var controller: OverlayController?
  private static let discoverer = ConcivDiscoveryRuntime.makeDiscoverer()

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
    ConcivDiscoveryRuntime.discover(using: discoverer) { endpoint in
      guard let endpoint else { return }
      mount(to: window, endpoint: endpoint, launcher: launcher)
    }
  }

  @MainActor
  public static func detach() {
    controller?.detach()
    controller = nil
  }

  @MainActor
  private static func mount(to window: UIWindow, endpoint: ConcivEndpoint, launcher: ConcivLauncher) {
    detach()
    let overlay = OverlayController(hostWindow: window, endpoint: endpoint, launcher: launcher)
    overlay.onEndpointLost = { [weak window, weak overlay] in
      guard let window, let overlay else { return }
      let previous = overlay.endpoint
      ConcivDiscoveryRuntime.discover(using: discoverer) { discovered in
        guard let discovered, controller === overlay else { return }
        // Same core (pid unchanged) re-points the live page (D8 rebind); a different
        // core is a fresh mount at the new origin, never a rebind.
        if ConcivDiscovery.isSameCore(previous: previous, discovered: discovered) {
          overlay.rebind(to: discovered)
        } else {
          mount(to: window, endpoint: discovered, launcher: launcher)
        }
      }
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
