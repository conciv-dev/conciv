#if canImport(UIKit)
import UIKit

// The native pick, split into a pure selection core (tested directly in
// PickSelectionTests, no WebView) and a drag overlay. UIKit selection is the
// spike's hit-test walk (appendix A.3); SwiftUI selection reads the anchor
// registry (04 D5). Both assemble a fixture-shaped NeutralGrab whose bounded
// subtree matches the TS fold caps in bridge-client.ts (depth 3, 40 nodes).

let subtreeMaxDepth = 3
let subtreeMaxNodes = 40

// Layout math produces frames like y = 330.000000000033; the rect is folded into the
// grab text the agent (and the staged-grab chip) reads, so a raw float there is noise
// with no meaning. Pick geometry is point-precise by nature, so round on the way out.
func rectToBridge(_ rect: CGRect) -> Rect {
  Rect(
    x: rect.origin.x.rounded(),
    y: rect.origin.y.rounded(),
    width: rect.size.width.rounded(),
    height: rect.size.height.rounded()
  )
}

func pickClassLabel(_ view: UIView) -> String {
  String(describing: type(of: view))
}

// Private UIKit chrome: decoration views, separators, system background views, swipe
// containers, and SwiftUI's mangled internal hosts all carry a leading underscore. They
// are implementation detail with no meaning to the agent (a section-background
// decoration spans the whole section and crops to a blank image), so they are never pick
// candidates; the walk keeps unwinding to the nearest non-private interesting ancestor.
func pickIsPrivateChrome(_ view: UIView) -> Bool {
  pickClassLabel(view).hasPrefix("_")
}

// A class name fit to show a human: generic parameters dropped, leading underscores
// dropped, and a Swift-mangled name (_TtGC7SwiftUI...) rejected outright.
func pickCleanedClassName(_ raw: String) -> String? {
  let withoutGenerics = raw.prefix { $0 != "<" }
  let withoutUnderscores = withoutGenerics.drop { $0 == "_" }
  guard !withoutUnderscores.isEmpty, !withoutUnderscores.hasPrefix("Tt") else { return nil }
  return String(withoutUnderscores)
}

// The source label the staged grab chip shows. A cleaned class name is the most useful
// answer (UILabel, PaymentCardCell); when the class name is unusable the accessibility
// strings are the only human text left, and "View" is the last resort. A mangled or
// underscore-prefixed class name never reaches the chip.
func pickSourceLabel(_ view: UIView) -> String {
  if let cleaned = pickCleanedClassName(pickClassLabel(view)) { return cleaned }
  if let identifier = view.accessibilityIdentifier, !identifier.isEmpty { return identifier }
  if let label = view.accessibilityLabel, !label.isEmpty { return label }
  return "View"
}

func pickFrameInWindow(_ view: UIView) -> CGRect {
  view.convert(view.bounds, to: nil)
}

// The one visibility rule every pick walk shares (hit-test, text collection, subtree
// build, capability probe). A reused table-view cell keeps hidden labels populated, so a
// walk that skips this leaks stale text into the grab the agent reads.
let pickMinVisibleAlpha: CGFloat = 0.02

func pickIsVisible(_ view: UIView) -> Bool {
  !view.isHidden && view.alpha >= pickMinVisibleAlpha
}

func pickIsInteresting(_ view: UIView) -> Bool {
  if let label = view as? UILabel { return !(label.text?.isEmpty ?? true) }
  if let image = view as? UIImageView { return image.image != nil }
  if view is UIControl { return true }
  if view is UITableViewCell { return true }
  if view is UICollectionViewCell { return true }
  let background = view.backgroundColor
  let hasFill = background != nil && background != .clear && (background?.cgColor.alpha ?? 0) > 0.01
  return hasFill && view.bounds.width > 24 && view.bounds.height > 24
}

func pickSearch(from node: UIView, at windowPoint: CGPoint, isExcluded: (UIView) -> Bool) -> UIView? {
  for child in node.subviews.reversed() {
    if !pickIsVisible(child) { continue }
    if isExcluded(child) { continue }
    let localPoint = child.convert(windowPoint, from: nil)
    if !child.bounds.contains(localPoint) { continue }
    if let deeper = pickSearch(from: child, at: windowPoint, isExcluded: isExcluded) { return deeper }
    if pickIsPrivateChrome(child) { continue }
    if pickIsInteresting(child) { return child }
  }
  return nil
}

// An anchor must cover this much of the view it is snapped to. A SwiftUI row anchor
// fills most of its cell, while the same anchor inside the whole collection view or a
// section-background decoration covers a sliver of it: the ratio is what separates
// "this view IS the anchored row" from "this view merely contains anchored rows".
let pickAnchorSnapMinCoverage: CGFloat = 0.2

private func pickArea(_ rect: CGRect) -> CGFloat {
  rect.width * rect.height
}

// Anchored-content snap. A SwiftUI `.concivGrab` anchor wraps the row's content only, so
// a tap in the cell's padding (or on its separator) misses the point hit-test and the
// UIKit walk resolves the unanchored cell chrome instead. The anchor is nonetheless the
// author's opt-in for that view: the resolved view IS the anchored row, dressed in
// padding.
//
// The relationship checked is descendant-of-the-resolved-view, and only that view, never
// its ancestors. Ascending would let a tap on an unanchored sibling reach a shared
// container and snap to the sibling's anchor, which the tap never went near. The
// point-containment case (a tap inside the anchor, or on a view nested within it) is
// already answered by ConcivAnchorRegistry.hitTest before this runs.
func pickAnchorSnap(from view: UIView, registry: ConcivAnchorRegistry) -> ConcivAnchorRegistry.Anchor? {
  let frame = pickFrameInWindow(view)
  guard pickArea(frame) > 0 else { return nil }
  guard let candidate = registry.anchors(within: frame).max(by: { pickArea($0.frame) < pickArea($1.frame) })
  else { return nil }
  guard pickArea(candidate.frame) / pickArea(frame) >= pickAnchorSnapMinCoverage else { return nil }
  return candidate
}

func pickOwnText(_ view: UIView) -> String? {
  if let label = view as? UILabel, let text = label.text, !text.isEmpty { return text }
  if let field = view as? UITextField, !field.isSecureTextEntry, let text = field.text, !text.isEmpty { return text }
  return nil
}

func pickCollectTexts(_ view: UIView) -> [String] {
  var texts: [String] = []
  func walk(_ node: UIView) {
    guard pickIsVisible(node) else { return }
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
    if !pickIsVisible(child) { continue }
    if isExcluded(child) { continue }
    guard let node = pickBuildViewNode(child, isExcluded: isExcluded, depth: depth + 1, budget: &budget) else {
      if budget <= 0 { break }
      continue
    }
    children.append(node)
  }
  return ViewNode(
    className: pickSourceLabel(view),
    a11yId: (identifier?.isEmpty ?? true) ? nil : identifier,
    text: pickOwnText(view),
    rect: rectToBridge(pickFrameInWindow(view)),
    children: children
  )
}

func pickNeutralGrab(fromUIView view: UIView, isExcluded: (UIView) -> Bool, preview: ImagePreview) -> NeutralGrab {
  let texts = pickCollectTexts(view)
  var budget = subtreeMaxNodes
  let subtree = pickBuildViewNode(view, isExcluded: isExcluded, depth: 0, budget: &budget)
  let componentName = pickSourceLabel(view)
  return NeutralGrab(
    text: texts.joined(separator: " · "),
    preview: preview,
    rect: rectToBridge(pickFrameInWindow(view)),
    source: Source(componentName: componentName, filePath: "", lineNumber: nil),
    subtree: subtree
  )
}

func pickNeutralGrab(fromAnchor anchor: ConcivAnchorRegistry.Anchor, registry: ConcivAnchorRegistry, preview: ImagePreview) -> NeutralGrab {
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
    preview: preview,
    rect: rectToBridge(anchor.frame),
    source: Source(componentName: anchor.id, filePath: "", lineNumber: nil),
    subtree: subtree
  )
}

// The selection-mode pill sits on the pick overlay. It swallows its own touches so a tap
// on the pill body never falls through the responder chain to the overlay's onSelect and
// picks the element underneath; its close button, a subview, still receives touches via
// hit-testing and drives cancel.
final class PickBannerView: UIView {
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {}
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {}
  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {}
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {}
}

final class PickOverlayView: UIView {
  var onMove: ((CGPoint) -> Void)?
  var onSelect: ((CGPoint) -> Void)?
  var onCancel: (() -> Void)?

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
    onCancel?()
  }
}
#endif
