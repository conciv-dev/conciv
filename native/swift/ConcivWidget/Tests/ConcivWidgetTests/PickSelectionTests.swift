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
  private let stubPreview = ImagePreview(dataUrl: "data:image/jpeg;base64,AA==", width: 10, height: 10)

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

    let grab = pickNeutralGrab(fromUIView: label, isExcluded: { _ in false }, preview: stubPreview)
    XCTAssertEqual(grab.text, "Payroll Deposit")
    XCTAssertEqual(grab.source?.componentName, "UILabel")
    XCTAssertEqual(grab.rect, rectToBridge(pickFrameInWindow(label)))
    XCTAssertEqual(grab.rect?.width, 200)
    XCTAssertEqual(grab.subtree?.className, "UILabel")
  }

  func testPickClassLabelStripsModuleQualifierForSwiftSubclass() {
    let cell = FixturePaymentCardCell(frame: CGRect(x: 0, y: 0, width: 100, height: 40))
    XCTAssertEqual(pickClassLabel(cell), "FixturePaymentCardCell")

    let grab = pickNeutralGrab(fromUIView: cell, isExcluded: { _ in false }, preview: stubPreview)
    XCTAssertEqual(grab.source?.componentName, "FixturePaymentCardCell")
    XCTAssertEqual(grab.subtree?.className, "FixturePaymentCardCell")
  }

  func testPickOverlayCancelledGestureEndsPickWithoutSelecting() {
    let overlay = PickOverlayView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    var selectedAt: CGPoint?
    var cancelled = false
    overlay.onSelect = { selectedAt = $0 }
    overlay.onCancel = { cancelled = true }

    overlay.touchesCancelled(Set<UITouch>(), with: nil)

    XCTAssertTrue(cancelled, "a system-cancelled gesture must end the pick as cancelled")
    XCTAssertNil(selectedAt, "a cancelled gesture must not report a selection")
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

    let grab = pickNeutralGrab(fromAnchor: anchor, registry: ConcivAnchorRegistry.shared, preview: stubPreview)
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
    let grab = pickNeutralGrab(fromAnchor: container, registry: ConcivAnchorRegistry.shared, preview: stubPreview)
    let childIds = grab.subtree?.children.map { $0.a11yId } ?? []
    XCTAssertTrue(childIds.contains("amount"), "nested anchor should appear in the subtree")
  }

  // Private UIKit chrome (leading-underscore class names: list decoration views, cell
  // separators, system background views) is implementation detail: a decoration view
  // spans a whole section and crops to a blank image, so it must never win a pick. The
  // walk unwinds past it to the nearest non-private interesting ancestor.
  func testPrivateChromeIsNeverAPickCandidate() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let root = UIViewController()
    window.rootViewController = root
    window.isHidden = false

    let card = UIView(frame: CGRect(x: 16, y: 200, width: 358, height: 120))
    card.backgroundColor = .white
    root.view.addSubview(card)

    let decoration = _FixtureDecorationView(frame: card.bounds)
    decoration.backgroundColor = .systemGray
    card.addSubview(decoration)
    root.view.layoutIfNeeded()

    let point = CGPoint(x: card.frame.midX, y: card.frame.midY)
    let picked = pickSearch(from: root.view, at: point, isExcluded: { _ in false })

    XCTAssertFalse(picked is _FixtureDecorationView, "private chrome must never be a pick candidate")
    XCTAssertTrue(picked === card, "the walk must unwind to the nearest non-private interesting ancestor")
  }

  // A SwiftUI `.concivGrab` anchor wraps the row content only, never the cell padding or
  // its separator, so a tap in that padding misses the point hit-test and the UIKit walk
  // lands on unanchored cell chrome. The anchored ancestor must still win.
  func testAnchoredAncestorWinsOverADeeperUnanchoredHit() {
    let host = UIHostingController(rootView: AnchoredList())
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = host
    window.isHidden = false
    window.makeKeyAndVisible()
    host.view.layoutIfNeeded()

    guard let anchor = waitForAnchor("listRow1") else {
      return XCTFail("expected the list row anchor to register")
    }
    let padding = CGPoint(x: anchor.frame.midX, y: anchor.frame.minY - 8)
    XCTAssertNil(ConcivAnchorRegistry.shared.hitTest(padding), "the tap must land outside the anchor's own frame")

    guard let picked = pickSearch(from: host.view, at: padding, isExcluded: { _ in false }) else {
      return XCTFail("expected the hit-test walk to resolve cell chrome")
    }
    let snapped = pickAnchorSnap(from: picked, registry: ConcivAnchorRegistry.shared)

    XCTAssertEqual(snapped?.id, "listRow1", "the anchored ancestor must win over the deeper unanchored hit")
    XCTAssertEqual(snapped?.label, "First row")
  }

  // The whole collection view contains every row anchor but is not any of them: snapping
  // there would attach the entire list for a tap on empty space below the last row.
  func testAnchorSnapIgnoresAContainerThatMerelyHoldsAnchors() {
    let host = UIHostingController(rootView: AnchoredList())
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = host
    window.isHidden = false
    window.makeKeyAndVisible()
    host.view.layoutIfNeeded()

    guard waitForAnchor("listRow1") != nil else { return XCTFail("expected the list row anchor to register") }
    let snapped = pickAnchorSnap(from: host.view, registry: ConcivAnchorRegistry.shared)

    XCTAssertNil(snapped, "a container that merely holds anchors must not be snapped to one of them")
  }

  // The snap must never reach past the view the walk resolved. A card holding an anchored
  // child next to an unanchored sibling would otherwise hand a tap on the sibling the
  // neighbour's anchor, which the tap never went near.
  func testAnchorSnapDoesNotReachAnUnanchoredSiblingsNeighbour() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let root = UIViewController()
    window.rootViewController = root
    window.isHidden = false

    let card = UIView(frame: CGRect(x: 16, y: 200, width: 358, height: 120))
    card.backgroundColor = .white
    root.view.addSubview(card)

    let anchored = UIView(frame: CGRect(x: 0, y: 0, width: 179, height: 120))
    anchored.backgroundColor = .systemTeal
    card.addSubview(anchored)

    let sibling = UIView(frame: CGRect(x: 179, y: 0, width: 179, height: 120))
    sibling.backgroundColor = .systemPink
    card.addSubview(sibling)
    root.view.layoutIfNeeded()

    ConcivAnchorRegistry.shared.register(id: "anchoredHalf", label: "Anchored half", frame: pickFrameInWindow(anchored))
    let point = CGPoint(x: sibling.frame.midX + card.frame.minX, y: card.frame.midY)
    let picked = pickSearch(from: root.view, at: point, isExcluded: { _ in false })

    XCTAssertTrue(picked === sibling, "the tap must resolve the unanchored sibling")
    XCTAssertNil(ConcivAnchorRegistry.shared.hitTest(point), "the tap must land outside the anchor")
    XCTAssertNil(
      pickAnchorSnap(from: sibling, registry: ConcivAnchorRegistry.shared),
      "an unanchored sibling must never snap to its neighbour's anchor"
    )
  }

  // A mangled or private class name is meaningless to the human reading the staged grab
  // chip, so the source label is always something readable.
  func testFallbackLabelNeverSurfacesAPrivateClassName() {
    let decoration = _FixtureDecorationView(frame: CGRect(x: 0, y: 0, width: 100, height: 40))
    let grab = pickNeutralGrab(fromUIView: decoration, isExcluded: { _ in false }, preview: stubPreview)

    XCTAssertEqual(grab.source?.componentName, "FixtureDecorationView")
    XCTAssertFalse(grab.source?.componentName?.hasPrefix("_") ?? true, "a leading-underscore class name must never reach the chip")
    XCTAssertEqual(grab.subtree?.className, "FixtureDecorationView")

    XCTAssertNil(pickCleanedClassName("_TtGC7SwiftUI19UIHostingViewBaseVS_7AnyView"), "a Swift-mangled name is not a label")
    XCTAssertEqual(pickCleanedClassName("CellHostingView<ModifiedContent<Row, Modifier>>"), "CellHostingView")
  }

  // A Swift-mangled runtime class name carries no readable text at all, so the label
  // falls through to the accessibility strings and finally to a generic word.
  func testFallbackLabelUsesAccessibilityWhenTheClassNameIsUnusable() {
    let view = _TtGC7FixtureMangledView(frame: CGRect(x: 0, y: 0, width: 100, height: 40))
    XCTAssertNil(pickCleanedClassName(pickClassLabel(view)), "the fixture's class name must be unusable")

    view.accessibilityIdentifier = "PaymentsScreen/payrollRow"
    view.accessibilityLabel = "Payroll row"
    XCTAssertEqual(pickSourceLabel(view), "PaymentsScreen/payrollRow")

    view.accessibilityIdentifier = nil
    XCTAssertEqual(pickSourceLabel(view), "Payroll row")

    view.accessibilityLabel = nil
    XCTAssertEqual(pickSourceLabel(view), "View")

    XCTAssertEqual(pickSourceLabel(UIView(frame: .zero)), "UIView")
  }

  // Layout math produces frames like y = 330.000000000033; that rect is folded into the
  // grab text the agent reads, so it leaves the SDK as whole points.
  func testGrabRectIsRoundedToWholePoints() {
    let rect = rectToBridge(CGRect(x: -16.4, y: 330.000000000033, width: 421.6, height: 51.5))

    XCTAssertEqual(rect, Rect(x: -16, y: 330, width: 422, height: 52))
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

private final class FixturePaymentCardCell: UIView {}

// Stands in for UIKit's private chrome (_UICollectionViewListLayoutSectionBackgroundColor
// DecorationView, _UICollectionViewListSeparatorView, _UISystemBackgroundView): the
// leading underscore is the marker the pick walk keys on.
private final class _FixtureDecorationView: UIView {}

// Stands in for a Swift-mangled runtime class name (_TtGC7SwiftUI...): nothing readable
// survives the cleaner, so the source label must fall through to accessibility.
private final class _TtGC7FixtureMangledView: UIView {}

private struct AnchoredList: View {
  var body: some View {
    List {
      Section("Recent") {
        HStack {
          Text("First row")
          Spacer()
          Text("$1.00")
        }
        .concivGrab(id: "listRow1", label: "First row")
        HStack {
          Text("Second row")
          Spacer()
          Text("$2.00")
        }
        .concivGrab(id: "listRow2", label: "Second row")
      }
    }
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
