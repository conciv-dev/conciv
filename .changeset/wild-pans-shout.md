---
'@conciv/extension-ios': patch
---

Fix native pick targeting and the --autoshow one-shot. Private UIKit chrome (list
decoration views, separators, system background views) is no longer a pick candidate, so a
tap in a SwiftUI List row stops attaching a blank full-section crop; the pick now snaps to
the `.concivGrab` anchor on the tapped row even when the tap lands in the cell padding
outside the anchor's own frame. Grab source labels never surface a mangled or
underscore-prefixed class name, and view rects are reported as whole points instead of raw
layout floats. `ios.run --autoshow` waits for the page to report its panel state before
sending its single open, so the open no longer races the widget shell's listener and get
lost.
