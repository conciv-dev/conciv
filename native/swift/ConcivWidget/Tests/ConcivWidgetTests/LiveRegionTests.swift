import XCTest
import CoreGraphics
@testable import ConcivWidget

// The cross-runtime live-region state machine (the dead-panel regression). The page
// half and the native half were each tested against their own spec; the bug lived in
// the ordering between them. These assertions pin the native rule: interactivity is
// derived from the open flag, and a stale closed-shape rect that lands while open
// must never collapse the region back onto the launcher.
final class LiveRegionTests: XCTestCase {
  private let mascot = CGRect(x: 300, y: 760, width: 56, height: 56)
  private let fab = CGRect(x: 320, y: 780, width: 56, height: 56)
  private let panelPoint = CGPoint(x: 40, y: 120)

  func testOpenMakesRegionFullPanelRegardlessOfPriorRect() {
    var state = LiveRegionState()
    state.launcher = .mascot
    state.mascotRect = mascot
    state = applyPanelToggle(state, open: true, mascotRect: nil)
    let region = liveRegion(state, pickActive: false)
    XCTAssertEqual(region, .fullPanel)
    XCTAssertTrue(region.captures(panelPoint))
    XCTAssertTrue(region.captures(CGPoint(x: mascot.midX, y: mascot.midY)))
  }

  func testStaleClosedShapeRectWhileOpenDoesNotShrink() {
    var state = LiveRegionState()
    state.launcher = .mascot
    state = applyPanelToggle(state, open: true, mascotRect: nil)
    state = applyPanelToggle(state, open: true, mascotRect: mascot)
    let region = liveRegion(state, pickActive: false)
    XCTAssertEqual(region, .fullPanel)
    XCTAssertTrue(region.captures(panelPoint))
  }

  func testClosedShrinksToMascotRectForMascotLauncher() {
    var state = LiveRegionState()
    state.launcher = .mascot
    state = applyPanelToggle(state, open: false, mascotRect: mascot)
    let region = liveRegion(state, pickActive: false)
    XCTAssertEqual(region, .rect(mascot))
    XCTAssertTrue(region.captures(CGPoint(x: mascot.midX, y: mascot.midY)))
    XCTAssertFalse(region.captures(panelPoint))
  }

  func testClosedShrinksToFabRectForNativeLauncher() {
    var state = LiveRegionState()
    state.launcher = .native
    state.fabRect = fab
    state = applyPanelToggle(state, open: false, mascotRect: nil)
    let region = liveRegion(state, pickActive: false)
    XCTAssertEqual(region, .rect(fab))
    XCTAssertTrue(region.captures(CGPoint(x: fab.midX, y: fab.midY)))
    XCTAssertFalse(region.captures(panelPoint))
  }

  func testCloseAfterOpenReturnsToMascotRect() {
    var state = LiveRegionState()
    state.launcher = .mascot
    state = applyPanelToggle(state, open: false, mascotRect: mascot)
    state = applyPanelToggle(state, open: true, mascotRect: nil)
    XCTAssertEqual(liveRegion(state, pickActive: false), .fullPanel)
    state = applyPanelToggle(state, open: false, mascotRect: mascot)
    let region = liveRegion(state, pickActive: false)
    XCTAssertEqual(region, .rect(mascot))
    XCTAssertFalse(region.captures(panelPoint))
  }

  func testPickModeCapturesEverythingWhenClosed() {
    var state = LiveRegionState()
    state.launcher = .mascot
    state = applyPanelToggle(state, open: false, mascotRect: mascot)
    let region = liveRegion(state, pickActive: true)
    XCTAssertEqual(region, .fullPanel)
    XCTAssertTrue(region.captures(panelPoint))
  }
}
