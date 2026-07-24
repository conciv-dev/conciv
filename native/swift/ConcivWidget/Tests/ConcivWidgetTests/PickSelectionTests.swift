#if canImport(UIKit)
import XCTest
import SwiftUI
import UIKit
@testable import ConcivWidget

// UIKit/SwiftUI pick selection (07 section 5, AC3). Compiles and runs only on the
// simulator (canImport(UIKit)); on the macOS host `swift test` this file is empty.
// UIKit: the hit-test walk returns the interesting view + text + rect. SwiftUI: a
// real screen using .concivGrab(id:) returns the anchor id, label, and crop frame.
@MainActor
final class PickSelectionTests: XCTestCase {
  override func setUp() {
    super.setUp()
    ConcivAnchorRegistry.shared.reset()
  }

  override func tearDown() {
    ConcivAnchorRegistry.shared.reset()
    super.tearDown()
  }

  func testUIKitHitTestReturnsInterestingViewTextAndRect() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let root = UIViewController()
    window.rootViewController = root
    window.isHidden = false

    let card = UIView(frame: CGRect(x: 16, y: 200, width: 358, height: 80))
    card.backgroundColor = .white
    card.accessibilityIdentifier = "payrollCard"
    root.view.addSubview(card)

    let label = UILabel(frame: CGRect(x: 12, y: 12, width: 200, height: 24))
    label.text = "Payroll Deposit"
    card.addSubview(label)
    root.view.layoutIfNeeded()

    let point = label.convert(CGPoint(x: label.bounds.midX, y: label.bounds.midY), to: nil)
    let picked = pickSearch(from: root.view, at: point, isExcluded: { _ in false })
    XCTAssertTrue(picked === label, "expected the deepest interesting view")

    let grab = pickNeutralGrab(fromUIView: label, isExcluded: { _ in false }, image: nil)
    XCTAssertEqual(grab.text, "Payroll Deposit")
    XCTAssertEqual(grab.source?.componentName, "UILabel")
    XCTAssertEqual(grab.rect, rectToBridge(pickFrameInWindow(label)))
    XCTAssertEqual(grab.rect?.width, 200)
    XCTAssertEqual(grab.subtree?.className, "UILabel")
  }

  func testUIKitExcludedOverlayIsSkipped() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let root = UIViewController()
    window.rootViewController = root
    window.isHidden = false

    let overlay = UIView(frame: root.view.bounds)
    overlay.backgroundColor = .black
    root.view.addSubview(overlay)
    root.view.layoutIfNeeded()

    let picked = pickSearch(from: root.view, at: CGPoint(x: 100, y: 300), isExcluded: { $0 === overlay })
    XCTAssertNil(picked, "the excluded overlay must not be selectable")
  }

  func testSwiftUIAnchorPickReturnsIdLabelAndCropFrame() {
    let host = UIHostingController(rootView: AnchoredRow())
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = host
    window.isHidden = false
    host.view.layoutIfNeeded()

    guard let anchor = waitForAnchor("payrollRow") else {
      return XCTFail("expected the .concivGrab anchor to register")
    }
    XCTAssertEqual(anchor.label, "Payroll Deposit")
    XCTAssertGreaterThan(anchor.frame.width, 0)

    let hit = ConcivAnchorRegistry.shared.hitTest(CGPoint(x: anchor.frame.midX, y: anchor.frame.midY))
    XCTAssertEqual(hit?.id, "payrollRow")

    let grab = pickNeutralGrab(fromAnchor: anchor, registry: ConcivAnchorRegistry.shared, image: nil)
    XCTAssertEqual(grab.source?.componentName, "payrollRow")
    XCTAssertEqual(grab.text, "Payroll Deposit")
    XCTAssertEqual(grab.rect, rectToBridge(anchor.frame))
    XCTAssertEqual(grab.subtree?.a11yId, "payrollRow")
  }

  func testSwiftUINestedAnchorsBecomeSubtree() {
    let host = UIHostingController(rootView: NestedAnchoredRow())
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = host
    window.isHidden = false
    host.view.layoutIfNeeded()

    guard let container = waitForAnchor("row"), waitForAnchor("amount") != nil else {
      return XCTFail("expected both anchors to register")
    }
    let grab = pickNeutralGrab(fromAnchor: container, registry: ConcivAnchorRegistry.shared, image: nil)
    let childIds = grab.subtree?.children.map { $0.a11yId } ?? []
    XCTAssertTrue(childIds.contains("amount"), "nested anchor should appear in the subtree")
  }

  private func waitForAnchor(_ id: String, timeout: TimeInterval = 3) -> ConcivAnchorRegistry.Anchor? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let anchor = ConcivAnchorRegistry.shared.anchor(for: id) { return anchor }
      RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
    }
    return ConcivAnchorRegistry.shared.anchor(for: id)
  }
}

private struct AnchoredRow: View {
  var body: some View {
    VStack {
      Text("Payroll Deposit")
        .frame(width: 300, height: 60)
        .concivGrab(id: "payrollRow", label: "Payroll Deposit")
      Spacer()
    }
    .padding()
  }
}

private struct NestedAnchoredRow: View {
  var body: some View {
    VStack {
      HStack {
        Text("Payroll Deposit")
        Text("+$3,120.00")
          .frame(width: 100, height: 20)
          .concivGrab(id: "amount", label: "+$3,120.00")
      }
      .frame(width: 300, height: 60)
      .concivGrab(id: "row", label: "Payroll row")
      Spacer()
    }
    .padding()
  }
}
#endif
