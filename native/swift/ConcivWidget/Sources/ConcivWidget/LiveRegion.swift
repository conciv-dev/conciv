import CoreGraphics

public enum ConcivLauncher {
  case native
  case mascot
}

// The passthrough overlay's live region: the area where the overlay swallows a
// touch instead of letting it fall through to the host app. Interactivity is
// derived from the open flag, never from whichever rect was written last. Open =>
// the whole panel is live; closed => only the launcher (FAB or mascot) is live,
// plus the re-pair banner's own frame while that banner is showing.
enum LiveRegion: Equatable {
  case fullPanel
  case rect(CGRect)
  case rects([CGRect])

  func captures(_ point: CGPoint) -> Bool {
    switch self {
    case .fullPanel: return true
    case .rect(let frame): return frame.contains(point)
    case .rects(let frames): return frames.contains { $0.contains(point) }
    }
  }
}

// bannerRect is the re-pair prompt's frame while it is on screen. The prompt must be
// tappable without making the whole overlay modal: a prompt that outlives the bounded
// rediscovery loop would otherwise leave the host app permanently non-interactive.
struct LiveRegionState: Equatable {
  var panelOpen = false
  var launcher: ConcivLauncher = .mascot
  var fabRect: CGRect = .zero
  var mascotRect: CGRect = .zero
  var bannerRect: CGRect?
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
  let launcherRect = state.launcher == .native ? state.fabRect : state.mascotRect
  guard let bannerRect = state.bannerRect else { return .rect(launcherRect) }
  return .rects([launcherRect, bannerRect])
}

// The native FAB shows only in native-launcher mode and only while the panel is
// closed: an open panel would leave the button covering the composer, so it hides
// until the page's own close control fires a closed panel-toggle. Mascot mode never
// shows the native FAB, since the web ShellFab owns the launcher there.
func fabHidden(launcher: ConcivLauncher, panelOpen: Bool) -> Bool {
  if launcher != .native { return true }
  return panelOpen
}
