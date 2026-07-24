#if canImport(UIKit)
import UIKit

// Render-and-crop capture from the spike (appendix A.3): drawHierarchy at 2x into a
// JPEG data-URL. For a UIView selection the target view is rendered directly; for a
// SwiftUI anchor the hosting view is rendered and cropped to the anchor frame, since
// the anchored element has no backing UIView of its own (04 D5).

enum Capture {
  static let jpegQuality: CGFloat = 0.6
  static let renderScale: CGFloat = 2
  static let maxPreviewPointEdge: CGFloat = 1024
  static let maxDataUrlBytes = 2 * 1024 * 1024

  // drawHierarchy(afterScreenUpdates:) can capture blank/stale content if the app
  // is not foreground-active mid-pick (04 m-A18). Callers must resolve the pick null
  // rather than deliver a blank preview when this returns false.
  static func isActiveForCapture() -> Bool {
    UIApplication.shared.applicationState == .active
  }

  // A big view (a full scroll surface, a tall list row) would otherwise render at 2x
  // into a multi-megabyte base64 string interpolated into JS. Bound the long edge so the
  // rendered pixel size stays capped, dropping the scale below 2x only for large views.
  static func effectiveScale(forLongEdge longEdge: CGFloat) -> CGFloat {
    guard longEdge > maxPreviewPointEdge else { return renderScale }
    return renderScale * maxPreviewPointEdge / longEdge
  }

  static func renderView(_ target: UIView) -> UIImage? {
    let bounds = target.bounds
    if bounds.width < 1 || bounds.height < 1 { return nil }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = effectiveScale(forLongEdge: max(bounds.width, bounds.height))
    return UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
      target.drawHierarchy(in: bounds, afterScreenUpdates: true)
    }
  }

  static func renderHostView(_ host: UIView, cropTo frameInHost: CGRect) -> UIImage? {
    let bounds = frameInHost.intersection(host.bounds)
    if bounds.width < 1 || bounds.height < 1 { return nil }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = effectiveScale(forLongEdge: max(bounds.width, bounds.height))
    return UIGraphicsImageRenderer(bounds: bounds, format: format).image { _ in
      host.drawHierarchy(in: host.bounds, afterScreenUpdates: true)
    }
  }

  // The scale cap keeps typical previews small; this is the hard backstop. A dataUrl over
  // the ceiling returns nil so the pick fails rather than shipping a blank preview, and an
  // oversized payload never rides the bridge into an evaluateJavaScript source string.
  static func jpegDataUrl(_ image: UIImage) -> String? {
    guard let data = image.jpegData(compressionQuality: jpegQuality) else { return nil }
    let dataUrl = "data:image/jpeg;base64,\(data.base64EncodedString())"
    return dataUrl.utf8.count <= maxDataUrlBytes ? dataUrl : nil
  }

  // A pick without a visual is a failed pick: when rendering or the data-url ceiling
  // yields no image, return nil so the caller resolves the pick failed rather than
  // shipping a blank preview.
  static func imagePreview(_ image: UIImage?) -> ImagePreview? {
    guard let image, let dataUrl = jpegDataUrl(image) else { return nil }
    return ImagePreview(dataUrl: dataUrl, width: image.size.width, height: image.size.height)
  }
}
#endif
