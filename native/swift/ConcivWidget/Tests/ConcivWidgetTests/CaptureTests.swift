#if canImport(UIKit)
import XCTest
import UIKit
@testable import ConcivWidget

// Render-and-crop capture path (Capture). effectiveScale is pinned in
// OverlayGeometryTests; this covers the crop geometry the SwiftUI anchor path relies on
// (04 D5), the fail-closed contract when UIKit reports a render failure, and the preview
// packaging. The crop is asserted through Capture.cropBounds rather than a real render:
// an xctest bundle has no foreground app, so the render server refuses every
// drawHierarchy here - which is precisely the failure the renderers must not paper over.
@MainActor
final class CaptureTests: XCTestCase {
  private func syntheticImage(_ size: CGSize) -> UIImage {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = Capture.renderScale
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.systemRed.setFill()
      context.fill(CGRect(origin: .zero, size: size))
    }
  }

  func testCropBoundsKeepsTheOffsetFrameSize() {
    let bounds = Capture.cropBounds(CGRect(x: 40, y: 60, width: 100, height: 80), in: CGRect(x: 0, y: 0, width: 200, height: 200))
    XCTAssertEqual(bounds?.width, 100)
    XCTAssertEqual(bounds?.height, 80)
    XCTAssertEqual(bounds?.origin.x, 40)
    XCTAssertEqual(bounds?.origin.y, 60)
  }

  func testCropBoundsClampsACropExtendingPastTheBounds() {
    let bounds = Capture.cropBounds(CGRect(x: 60, y: 60, width: 80, height: 80), in: CGRect(x: 0, y: 0, width: 100, height: 100))
    XCTAssertEqual(bounds?.width, 40)
    XCTAssertEqual(bounds?.height, 40)
  }

  func testCropBoundsIsNilWhenTheCropIsDisjointFromTheBounds() {
    XCTAssertNil(Capture.cropBounds(CGRect(x: 200, y: 200, width: 50, height: 50), in: CGRect(x: 0, y: 0, width: 100, height: 100)))
  }

  func testRenderHostViewReturnsNilWhenTheCropIsDisjointFromTheBounds() {
    let host = UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
    XCTAssertNil(Capture.renderHostView(host, cropTo: CGRect(x: 200, y: 200, width: 50, height: 50)))
  }

  // The blank-preview class: UIKit refuses to snapshot a hierarchy no foreground app owns
  // and reports it, while the renderer still hands back a valid-looking blank UIImage. Both
  // renderers must surface that as no image so the pick resolves failed.
  func testRenderersFailClosedWhenUikitReportsARenderFailure() {
    let detached = UIView(frame: CGRect(x: 0, y: 0, width: 120, height: 90))
    detached.backgroundColor = .systemGreen
    XCTAssertNil(Capture.renderView(detached), "a reported render failure must not yield a blank preview")
    XCTAssertNil(Capture.renderHostView(detached, cropTo: CGRect(x: 0, y: 0, width: 60, height: 60)))
  }

  func testImagePreviewCarriesThePointDimensionsAndADecodableJpegDataUrl() {
    guard let preview = Capture.imagePreview(syntheticImage(CGSize(width: 100, height: 80))) else {
      return XCTFail("expected an image preview")
    }
    XCTAssertEqual(preview.width, 100, accuracy: 0.0001)
    XCTAssertEqual(preview.height, 80, accuracy: 0.0001)
    let prefix = "data:image/jpeg;base64,"
    XCTAssertTrue(preview.dataUrl.hasPrefix(prefix), "the preview must be a jpeg data-URL")
    let payload = String(preview.dataUrl.dropFirst(prefix.count))
    XCTAssertNotNil(Data(base64Encoded: payload), "the data-URL payload must be decodable base64")
  }

  func testImagePreviewIsNilWithoutAnImage() {
    XCTAssertNil(Capture.imagePreview(nil), "a failed render must not become a preview")
  }
}
#endif
