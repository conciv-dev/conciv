#if canImport(UIKit)
import UIKit

// The native pick, split into a pure selection core (tested directly in
// PickSelectionTests, no WebView) and a drag overlay. UIKit selection is the
// spike's hit-test walk (appendix A.3); SwiftUI selection reads the anchor
// registry (04 D5). Both assemble a fixture-shaped NeutralGrab whose bounded
// subtree matches the TS fold caps in bridge-client.ts (depth 3, 40 nodes).

let subtreeMaxDepth = 3
let subtreeMaxNodes = 40

func rectToBridge(_ rect: CGRect) -> Rect {
  Rect(x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height)
}

func pickClassLabel(_ view: UIView) -> String {
  NSStringFromClass(type(of: view))
}

func pickFrameInWindow(_ view: UIView) -> CGRect {
  view.convert(view.bounds, to: nil)
}

func pickIsInteresting(_ view: UIView) -> Bool {
  if let label = view as? UILabel { return !(label.text?.isEmpty ?? true) }
  if let image = view as? UIImageView { return image.image != nil }
  if view is UIControl { return true }
  if view is UITableViewCell { return true }
  let background = view.backgroundColor
  let hasFill = background != nil && background != .clear && (background?.cgColor.alpha ?? 0) > 0.01
  return hasFill && view.bounds.width > 24 && view.bounds.height > 24
}

func pickSearch(from node: UIView, at windowPoint: CGPoint, isExcluded: (UIView) -> Bool) -> UIView? {
  for child in node.subviews.reversed() {
    if child.isHidden || child.alpha < 0.02 { continue }
    if isExcluded(child) { continue }
    let localPoint = child.convert(windowPoint, from: nil)
    if !child.bounds.contains(localPoint) { continue }
    if let deeper = pickSearch(from: child, at: windowPoint, isExcluded: isExcluded) { return deeper }
    if pickIsInteresting(child) { return child }
  }
  return nil
}

func pickOwnText(_ view: UIView) -> String? {
  if let label = view as? UILabel, let text = label.text, !text.isEmpty { return text }
  if let field = view as? UITextField, let text = field.text, !text.isEmpty { return text }
  return nil
}

func pickCollectTexts(_ view: UIView) -> [String] {
  var texts: [String] = []
  func walk(_ node: UIView) {
    if let text = pickOwnText(node) { texts.append(text) }
    for child in node.subviews { walk(child) }
  }
  walk(view)
  return texts
}

func pickBuildViewNode(_ view: UIView, isExcluded: (UIView) -> Bool, depth: Int, budget: inout Int) -> ViewNode? {
  if depth > subtreeMaxDepth { return nil }
  if budget <= 0 { return nil }
  budget -= 1
  let identifier = view.accessibilityIdentifier
  var children: [ViewNode] = []
  for child in view.subviews {
    if child.isHidden || child.alpha < 0.02 { continue }
    if isExcluded(child) { continue }
    guard let node = pickBuildViewNode(child, isExcluded: isExcluded, depth: depth + 1, budget: &budget) else {
      if budget <= 0 { break }
      continue
    }
    children.append(node)
  }
  return ViewNode(
    className: pickClassLabel(view),
    a11yId: (identifier?.isEmpty ?? true) ? nil : identifier,
    text: pickOwnText(view),
    rect: rectToBridge(pickFrameInWindow(view)),
    children: children
  )
}

func pickNeutralGrab(fromUIView view: UIView, isExcluded: (UIView) -> Bool, image: UIImage?) -> NeutralGrab {
  let texts = pickCollectTexts(view)
  var budget = subtreeMaxNodes
  let subtree = pickBuildViewNode(view, isExcluded: isExcluded, depth: 0, budget: &budget)
  let identifier = view.accessibilityIdentifier
  let componentName = (identifier?.isEmpty ?? true) ? pickClassLabel(view) : identifier
  return NeutralGrab(
    text: texts.joined(separator: " · "),
    preview: Capture.imagePreview(image),
    rect: rectToBridge(pickFrameInWindow(view)),
    source: Source(componentName: componentName, filePath: "", lineNumber: nil),
    subtree: subtree
  )
}

func pickNeutralGrab(fromAnchor anchor: ConcivAnchorRegistry.Anchor, registry: ConcivAnchorRegistry, image: UIImage?) -> NeutralGrab {
  let descendants = registry.descendants(of: anchor)
    .sorted { ($0.frame.width * $0.frame.height) > ($1.frame.width * $1.frame.height) }
    .prefix(subtreeMaxNodes - 1)
  let children = descendants.map { child in
    ViewNode(
      className: "ConcivGrabAnchor",
      a11yId: child.id,
      text: child.label,
      rect: rectToBridge(child.frame),
      children: []
    )
  }
  let subtree = ViewNode(
    className: "ConcivGrabAnchor",
    a11yId: anchor.id,
    text: anchor.label,
    rect: rectToBridge(anchor.frame),
    children: Array(children)
  )
  return NeutralGrab(
    text: anchor.label ?? anchor.id,
    preview: Capture.imagePreview(image),
    rect: rectToBridge(anchor.frame),
    source: Source(componentName: anchor.id, filePath: "", lineNumber: nil),
    subtree: subtree
  )
}

final class PickOverlayView: UIView {
  var onMove: ((CGPoint) -> Void)?
  var onSelect: ((CGPoint) -> Void)?

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    touches.first.map { onMove?($0.location(in: self)) }
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    touches.first.map { onMove?($0.location(in: self)) }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    touches.first.map { onSelect?($0.location(in: self)) }
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    onSelect?(.zero)
  }
}
#endif
