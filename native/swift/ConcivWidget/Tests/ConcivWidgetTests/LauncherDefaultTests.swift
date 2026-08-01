#if canImport(UIKit)
import XCTest
import UIKit
@testable import ConcivWidget

@MainActor
final class LauncherDefaultTests: XCTestCase {
  private func url(_ string: String) -> URL {
    guard let value = URL(string: string) else { fatalError("bad test url \(string)") }
    return value
  }

  private func makeWindow() -> UIWindow {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.isHidden = false
    return window
  }

  private func discovered() -> ConcivEndpoint {
    ConcivEndpoint(apiBase: url("http://127.0.0.1:59990"), token: nil, pid: 1)
  }

  private func assertMascotMount(_ message: String) {
    guard let controller = ConcivWidget.controller else { return XCTFail("expected a mounted overlay: \(message)") }
    XCTAssertEqual(controller.container.state.launcher, .mascot, message)
    XCTAssertEqual(
      controller.pageUrl,
      url("http://127.0.0.1:59990/native?launcher=mascot"),
      "the default mount must ask the page for the mascot launcher: \(message)"
    )
  }

  override func setUp() {
    super.setUp()
    ConcivWidget.discoverDriver = { _, completion in completion(self.discovered()) }
  }

  override func tearDown() {
    ConcivWidget.detach()
    ConcivWidget.discoverDriver = ConcivDiscoveryRuntime.discover
    ConcivWidget.keyWindowProvider = ConcivWidget.defaultKeyWindowProvider
    super.tearDown()
  }

  func testWindowlessDiscoveryAttachDefaultsToTheMascot() {
    let window = makeWindow()
    ConcivWidget.keyWindowProvider = { window }

    ConcivWidget.attach()

    assertMascotMount("attach() is the one-line integration, so its default is the shipped launcher")
  }

  func testWindowlessExplicitEndpointAttachDefaultsToTheMascot() {
    let window = makeWindow()
    ConcivWidget.keyWindowProvider = { window }

    ConcivWidget.attach(apiBase: url("http://127.0.0.1:59990"))

    assertMascotMount("attach(apiBase:) must default the same way as attach()")
  }

  func testWindowedExplicitEndpointAttachDefaultsToTheMascot() {
    ConcivWidget.attach(to: makeWindow(), apiBase: url("http://127.0.0.1:59990"))

    assertMascotMount("attach(to:apiBase:) must default the same way as attach()")
  }

  func testWindowedDiscoveryAttachDefaultsToTheMascot() {
    ConcivWidget.attach(to: makeWindow())

    assertMascotMount("attach(to:) must default the same way as attach()")
  }

  func testNativeLauncherStaysSelectable() {
    ConcivWidget.attach(to: makeWindow(), apiBase: url("http://127.0.0.1:59990"), launcher: .native)

    guard let controller = ConcivWidget.controller else { return XCTFail("expected a mounted overlay") }
    XCTAssertEqual(controller.container.state.launcher, .native, "the native FAB stays an explicit opt-in")
    XCTAssertEqual(
      controller.pageUrl,
      url("http://127.0.0.1:59990/native"),
      "native mode loads the page with no launcher query"
    )
  }
}
#endif
