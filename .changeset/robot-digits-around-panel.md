---
'@conciv/mascot': patch
'@conciv/app': patch
---

The binary emitter takes an `avoid` rectangle (`<Mascot.Binary avoid>` / `configureBinaryEffect({avoid})`), in viewport pixels. With it set, the digits rise to the nearest edge in their way, that rectangle or the top of the viewport, then go around the rectangle's nearer free side and climb along it, or run along the edge when there is no room beside it. A new value retargets the digits already in flight at most once per animation frame. The widget launcher passes the open chat panel's frame, derived from the launcher's position and the panel's measured size, so the robot's digits travel around the panel instead of over its status bar and composer, and follow it while the launcher is dragged or the panel is resized.
