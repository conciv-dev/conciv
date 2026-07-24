#if canImport(UIKit)
import UIKit

// Render-and-crop capture from the spike (appendix A.3): drawHierarchy at 2x into a
// JPEG data-URL. For a UIView selection the target view is rendered directly; for a
// SwiftUI anchor the hosting view is rendered and cropped to the anchor frame, since
// the anchored element has no backing UIView of its own (04 D5).

enum Capture {
  static let jpegQuality: CGFloat = 0.6
  static let renderScale: CGFloat = 2

  // drawHierarchy(afterScreenUpdates:) can capture blank/stale content if the app
  // is not foreground-active mid-pick (04 m-A18). Callers must resolve the pick null
  // rather than deliver a blank preview when this returns false.
  static func isActiveForCapture() -> Bool {
    UIApplication.shared.applicationState == .active
  }

  static func renderView(_ target: UIView) -> UIImage? {
    let bounds = target.bounds
    if bounds.width < 1 || bounds.height < 1 { return nil }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = renderScale
    return UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
      target.drawHierarchy(in: bounds, afterScreenUpdates: true)
    }
  }

  static func renderHostView(_ host: UIView, cropTo frameInHost: CGRect) -> UIImage? {
    let bounds = frameInHost.intersection(host.bounds)
    if bounds.width < 1 || bounds.height < 1 { return nil }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = renderScale
    return UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
      host.drawHierarchy(in: host.bounds, afterScreenUpdates: true)
    }
  }

  static func jpegDataUrl(_ image: UIImage) -> String? {
    guard let data = image.jpegData(compressionQuality: jpegQuality) else { return nil }
    return "data:image/jpeg;base64,\(data.base64EncodedString())"
  }

  static func imagePreview(_ image: UIImage?) -> ImagePreview {
    guard let image, let dataUrl = jpegDataUrl(image) else {
      return ImagePreview(dataUrl: "", width: 0, height: 0)
    }
    return ImagePreview(dataUrl: dataUrl, width: image.size.width, height: image.size.height)
  }
}
#endif
