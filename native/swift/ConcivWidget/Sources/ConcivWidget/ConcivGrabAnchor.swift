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

  public init() {}

  public func register(id: String, label: String?, frame: CGRect) {
    anchors[id] = Anchor(id: id, label: label, frame: frame)
  }

  public func unregister(id: String) {
    anchors.removeValue(forKey: id)
  }

  public func reset() {
    anchors.removeAll()
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
  }
}

extension View {
  public func concivGrab(id: String, label: String? = nil) -> some View {
    modifier(ConcivGrabModifier(id: id, label: label))
  }
}
#endif
