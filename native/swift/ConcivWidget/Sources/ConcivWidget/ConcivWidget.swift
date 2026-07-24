#if canImport(UIKit)
import UIKit

// Public entry point. Everything is #if DEBUG so no bridge code, WebView, or the
// dev-core URL compiles into a Release build (04 D14/M-A10). In Release, attach is
// a no-op; ship a Release configuration for any TestFlight/App Store build.
public enum ConcivWidget {
  #if DEBUG
  private static var controller: OverlayController?

  // apiBase is the core-served native page origin (http://127.0.0.1:<port>); the
  // SDK loads apiBase/native into a transparent overlay above the app's own UI.
  @MainActor
  public static func attach(
    to window: UIWindow,
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {
    detach()
    controller = OverlayController(hostWindow: window, apiBase: apiBase, token: token, launcher: launcher)
  }

  @MainActor
  public static func detach() {
    controller?.detach()
    controller = nil
  }
  #else
  public static func attach(
    to window: UIWindow,
    apiBase: URL,
    token: String? = nil,
    launcher: ConcivLauncher = .native
  ) {}

  public static func detach() {}
  #endif
}
#endif
