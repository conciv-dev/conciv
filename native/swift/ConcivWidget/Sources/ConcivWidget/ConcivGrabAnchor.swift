#if canImport(UIKit)
import SwiftUI
import UIKit

// SwiftUI content has no enumerable backing UIView tree the pick walk can traverse
// (04 D5/B-A3), so authors opt views into native grab with `.concivGrab(id:)`, the
// SwiftUI analog of `data-conciv-source`. The modifier records the view's global
// geometry, id, and optional label into a process-wide registry the pick overlay
// hit-tests instead of walking an accessibility tree.

public final class ConcivAnchorRegistry {
  public static let shared = ConcivAnchorRegistry()

  public struct Anchor: Equatable {
    public let id: String
    public let label: String?
    public let frame: CGRect
  }

  private var anchors: [String: Anchor] = [:]

  // Fired only when the anchor SET changes (add/remove), never on a frame update, so a
  // scroll that re-registers existing ids does not spam the grab-capability signal.
  public var onChange: (() -> Void)?

  public init() {}

  public func register(id: String, label: String?, frame: CGRect) {
    let isNew = anchors[id] == nil
    anchors[id] = Anchor(id: id, label: label, frame: frame)
    if isNew { onChange?() }
  }

  public func unregister(id: String) {
    guard anchors.removeValue(forKey: id) != nil else { return }
    onChange?()
  }

  public func reset() {
    guard !anchors.isEmpty else { return }
    anchors.removeAll()
    onChange?()
  }

  public func anchor(for id: String) -> Anchor? {
    anchors[id]
  }

  public var all: [Anchor] {
    Array(anchors.values)
  }

  // The smallest anchor whose frame contains the point: nested anchors win over
  // their container, mirroring the UIKit "deepest interesting view" rule.
  public func hitTest(_ point: CGPoint) -> Anchor? {
    anchors.values
      .filter { $0.frame.contains(point) }
      .min { lhs, rhs in (lhs.frame.width * lhs.frame.height) < (rhs.frame.width * rhs.frame.height) }
  }

  // Anchors whose frame lies inside the given frame. A SwiftUI anchor wraps only a
  // row's content, never the cell padding or its separator, so a tap in that padding
  // misses hitTest; the pick then asks which anchors live inside the view the hit-test
  // walk resolved and snaps to one (pickAnchorSnap).
  public func anchors(within frame: CGRect) -> [Anchor] {
    anchors.values.filter { frame.contains($0.frame) }
  }

  // Anchors strictly inside the given anchor's frame, used to build the bounded
  // grab-attached subtree for a SwiftUI selection.
  public func descendants(of anchor: Anchor) -> [Anchor] {
    anchors.values.filter { candidate in
      candidate.id != anchor.id && anchor.frame.contains(candidate.frame)
    }
  }
}

private struct ConcivGrabModifier: ViewModifier {
  let id: String
  let label: String?

  func body(content: Content) -> some View {
    #if DEBUG
    content.background(
      GeometryReader { proxy in
        Color.clear
          .onAppear {
            ConcivAnchorRegistry.shared.register(id: id, label: label, frame: proxy.frame(in: .global))
          }
          .onChange(of: proxy.frame(in: .global)) { _, newFrame in
            ConcivAnchorRegistry.shared.register(id: id, label: label, frame: newFrame)
          }
          .onDisappear {
            ConcivAnchorRegistry.shared.unregister(id: id)
          }
      }
    )
    #else
    content
    #endif
  }
}

extension View {
  public func concivGrab(id: String, label: String? = nil) -> some View {
    modifier(ConcivGrabModifier(id: id, label: label))
  }
}
#endif
