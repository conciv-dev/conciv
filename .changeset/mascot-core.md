---
'@conciv/mascot': patch
---

Restructure the mascot internals into a composable core behind a new `createMascot` service with `update`, `registerParts`, `connect` and `destroy`; `createFabRobotRig` stays as the legacy adapter over it. This turns on pointer-follow gaze in the closed state (eyes offset up to 3px, antenna lean up to 10deg) and rising binary digits from the antenna tip while working, on both the widget FAB and the site FAB.

The binary emitter is stage-relative: digit size, lane offsets, digit placement and rise distance are the
approved values scaled by `min(stageWidth, stageHeight) / 44`, so the digits grow with the robot on a large
stage instead of staying 9px specks. 44px is the widget FAB stage those values were approved against, so the
FAB itself is unchanged. Rise duration, stagger and eases are timing, not geometry, and never scale.
