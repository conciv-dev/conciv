import CoreGraphics

public enum ConcivLauncher {
  case native
  case mascot
}

// The passthrough overlay's live region: the area where the overlay swallows a
// touch instead of letting it fall through to the host app. Interactivity is
// derived from the open flag, never from whichever rect was written last. Open =>
// the whole panel is live; closed => only the launcher (FAB or mascot) is live.
enum LiveRegion: Equatable {
  case fullPanel
  case rect(CGRect)

  func captures(_ point: CGPoint) -> Bool {
    switch self {
    case .fullPanel: return true
    case .rect(let frame): return frame.contains(point)
    }
  }
}

struct LiveRegionState: Equatable {
  var panelOpen = false
  var launcher: ConcivLauncher = .native
  var fabRect: CGRect = .zero
  var mascotRect: CGRect = .zero
}

// Open wins on every event: a stale or duplicate closed-shape rect that lands while
// the panel is open must not shrink the region. The mascot rect only advances on a
// closed event, so an open event can never smuggle the launcher frame back in.
func applyPanelToggle(_ state: LiveRegionState, open: Bool, mascotRect: CGRect?) -> LiveRegionState {
  var next = state
  next.panelOpen = open
  if !open, let rect = mascotRect {
    next.mascotRect = rect
  }
  return next
}

func liveRegion(_ state: LiveRegionState, pickActive: Bool) -> LiveRegion {
  if pickActive { return .fullPanel }
  if state.panelOpen { return .fullPanel }
  if state.launcher == .native { return .rect(state.fabRect) }
  return .rect(state.mascotRect)
}
