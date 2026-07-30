import UIKit

// Builds the payments screen and, in DEBUG builds, attaches the conciv widget via
// auto-discovery. Discovery reads ~/.conciv/dev-endpoint.json (the simulator shares
// the host home) and falls back to probing the pinned dev-core port on 127.0.0.1, so
// no core URL has to be hardcoded here.
@objc(SceneDelegate)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    let payments = PaymentsViewController()
    let nav = UINavigationController(rootViewController: payments)
    window.rootViewController = nav
    window.makeKeyAndVisible()
    self.window = window

    #if DEBUG
    if let override = ProcessInfo.processInfo.environment["CONCIV_URL"],
       let apiBase = URL(string: override) {
      ConcivWidget.attach(to: window, apiBase: apiBase, launcher: .mascot)
    } else {
      ConcivWidget.attach(to: window, launcher: .mascot)
    }
    #endif
  }
}
