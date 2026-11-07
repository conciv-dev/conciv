---
'@conciv/mascot': patch
'@conciv/app': patch
---

The binary emitter takes a `bounds` getter (`<Mascot.Binary bounds>` / `configureBinaryEffect({bounds})`) for the room it measures, in viewport pixels, defaulting to the viewport. The widget launcher passes the open chat panel's bottom edge as the ceiling, so while a run is going the robot's digits bend along the panel's edge instead of rising over its status bar and composer.
