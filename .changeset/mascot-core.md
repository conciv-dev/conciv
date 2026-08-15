---
'@conciv/mascot': patch
---

Restructure the mascot internals into a composable core behind a new `createMascot` service with `update`, `registerParts`, `connect` and `destroy`; `createFabRobotRig` stays as the legacy adapter over it. This turns on pointer-follow gaze in the closed state (eyes offset up to 3px, antenna lean up to 10deg) and rising binary digits from the antenna tip while working, on both the widget FAB and the site FAB.
