#if canImport(UIKit)
import XCTest
import UIKit
@testable import ConcivWidget

// Render-and-crop capture path (Capture.renderHostView + imagePreview). effectiveScale is
// pinned in OverlayGeometryTests; this covers the host-view crop the SwiftUI anchor path
// relies on (04 D5): a non-zero crop origin yields an image sized to the crop, an origin
// past the bounds clamps to the intersection, and imagePreview carries those point
// dimensions plus a decodable jpeg data-URL.
@MainActor
final class CaptureTests: XCTestCase {
  private func mountedHost(_ size: CGSize) -> UIView {
    let window = UIWindow(frame: CGRect(origin: .zero, size: size))
    let root = UIViewController()
    window.rootViewController = root
    window.isHidden = false
    let host = UIView(frame: CGRect(origin: .zero, size: size))
    host.backgroundColor = .systemBlue
    let inner = UIView(frame: CGRect(x: 40, y: 60, width: 100, height: 80))
    inner.backgroundColor = .systemRed
    host.addSubview(inner)
    root.view.addSubview(host)
    root.view.layoutIfNeeded()
    return host
  }

  func testRenderHostViewCropsToTheOffsetFrameSize() {
    let host = mountedHost(CGSize(width: 200, height: 200))
    guard let image = Capture.renderHostView(host, cropTo: CGRect(x: 40, y: 60, width: 100, height: 80)) else {
      return XCTFail("expected a rendered crop image")
    }
    XCTAssertEqual(image.size.width, 100, accuracy: 0.0001)
    XCTAssertEqual(image.size.height, 80, accuracy: 0.0001)
    XCTAssertEqual(image.scale, Capture.renderScale, accuracy: 0.0001)
  }

  func testRenderHostViewClampsACropExtendingPastTheBounds() {
    let host = mountedHost(CGSize(width: 100, height: 100))
    guard let image = Capture.renderHostView(host, cropTo: CGRect(x: 60, y: 60, width: 80, height: 80)) else {
      return XCTFail("expected the crop to clamp to the host bounds")
    }
    XCTAssertEqual(image.size.width, 40, accuracy: 0.0001)
    XCTAssertEqual(image.size.height, 40, accuracy: 0.0001)
  }

  func testRenderHostViewReturnsNilWhenTheCropIsDisjointFromTheBounds() {
    let host = mountedHost(CGSize(width: 100, height: 100))
    XCTAssertNil(Capture.renderHostView(host, cropTo: CGRect(x: 200, y: 200, width: 50, height: 50)))
  }

  func testImagePreviewCarriesTheCroppedDimensionsAndADecodableJpegDataUrl() {
    let host = mountedHost(CGSize(width: 200, height: 200))
    guard let image = Capture.renderHostView(host, cropTo: CGRect(x: 40, y: 60, width: 100, height: 80)) else {
      return XCTFail("expected a rendered crop image")
    }
    guard let preview = Capture.imagePreview(image) else {
      return XCTFail("expected an image preview")
    }
    XCTAssertEqual(preview.width, 100, accuracy: 0.0001)
    XCTAssertEqual(preview.height, 80, accuracy: 0.0001)
    let prefix = "data:image/jpeg;base64,"
    XCTAssertTrue(preview.dataUrl.hasPrefix(prefix), "the preview must be a jpeg data-URL")
    let payload = String(preview.dataUrl.dropFirst(prefix.count))
    XCTAssertNotNil(Data(base64Encoded: payload), "the data-URL payload must be decodable base64")
  }
}
#endif
