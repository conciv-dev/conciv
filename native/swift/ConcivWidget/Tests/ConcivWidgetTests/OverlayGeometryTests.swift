#if canImport(UIKit)
import XCTest
import UIKit
@testable import ConcivWidget

// Pure geometry helpers pulled out of OverlayController so the layout math is pinned
// without a live WebView. The FAB must clear the home-indicator strip once real
// safe-area insets arrive, the keyboard overlap is computed in the container's own
// coordinate space, and an oversized capture is scaled down rather than shipped raw.
final class OverlayGeometryTests: XCTestCase {
  private let bounds = CGRect(x: 0, y: 0, width: 390, height: 844)

  func testFabFrameClearsBottomSafeAreaInset() {
    let safe = UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0)
    let frame = fabFrame(in: bounds, safeArea: safe)
    XCTAssertLessThanOrEqual(frame.maxY, bounds.height - safe.bottom, "FAB must sit above the home-indicator strip")
    XCTAssertLessThanOrEqual(frame.maxX, bounds.width - safe.right)
  }

  func testFabFrameWithZeroInsetsIsBottomTrailing() {
    let frame = fabFrame(in: bounds, safeArea: .zero)
    XCTAssertEqual(frame, CGRect(x: 314, y: 768, width: 56, height: 56))
  }

  func testKeyboardOverlapUsesIntersectionHeight() {
    let keyboard = CGRect(x: 0, y: 500, width: 390, height: 344)
    XCTAssertEqual(keyboardOverlap(keyboardInContainer: keyboard, containerBounds: bounds), 344)
  }

  func testKeyboardOverlapZeroWhenDisjoint() {
    let keyboard = CGRect(x: 0, y: 900, width: 390, height: 300)
    XCTAssertEqual(keyboardOverlap(keyboardInContainer: keyboard, containerBounds: bounds), 0)
  }

  func testCaptureScaleUnchangedForSmallViews() {
    XCTAssertEqual(Capture.effectiveScale(forLongEdge: 800), Capture.renderScale)
  }

  func testCaptureScaleShrinksForLargeViews() {
    let scale = Capture.effectiveScale(forLongEdge: 2048)
    XCTAssertEqual(scale, 1, accuracy: 0.0001)
    XCTAssertLessThan(scale, Capture.renderScale)
  }
}
#endif
