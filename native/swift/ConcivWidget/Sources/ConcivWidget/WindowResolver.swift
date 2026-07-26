#if canImport(UIKit)
import UIKit

// Resolves the key window for a windowless attach(). If a key window already exists the
// completion fires synchronously; otherwise it observes window/scene activation and fires
// once as soon as a key window appears, so attach() is callable from a SceneDelegate
// before makeKeyAndVisible or from a SwiftUI App.init before the first scene activates.
// One resolver observes at a time (ConcivWidget holds a single instance and replaces it on
// re-attach); it self-unregisters after the first resolution and on deinit, so a superseded
// attach cannot leave a dangling observer that mounts a stale window.
@MainActor
final class ConcivWindowResolver: NSObject {
  private let keyWindow: () -> UIWindow?
  private let onResolve: (UIWindow) -> Void
  private var resolved = false

  init(keyWindow: @escaping () -> UIWindow?, onResolve: @escaping (UIWindow) -> Void) {
    self.keyWindow = keyWindow
    self.onResolve = onResolve
    super.init()
  }

  func start() {
    if let window = keyWindow() {
      resolve(window)
      return
    }
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(activated), name: UIWindow.didBecomeKeyNotification, object: nil)
    center.addObserver(self, selector: #selector(activated), name: UIScene.didActivateNotification, object: nil)
  }

  @objc private func activated() {
    guard let window = keyWindow() else { return }
    resolve(window)
  }

  private func resolve(_ window: UIWindow) {
    guard !resolved else { return }
    resolved = true
    NotificationCenter.default.removeObserver(self)
    onResolve(window)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }
}
#endif
