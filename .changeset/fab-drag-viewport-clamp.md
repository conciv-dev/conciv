---
'@conciv/embed': patch
---

Dragging the closed launcher no longer jitters outside the viewport and no longer snaps back from a valid drop. The live drag position is clamped so the button never renders past a viewport edge, the drag offset rides a single owner (an inline transform relative to the button's own resting anchor instead of competing `left`/`top` writes), and the release glides to the snap point through one Web Animations pass whose end state is the resting state — so the hand-off back to CSS moves nothing. A drop that is already at the resting spot skips the animation entirely.
