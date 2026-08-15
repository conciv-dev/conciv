---
'@conciv/mascot': patch
---

Restructure the mascot internals into a composable core behind a new `createMascot` service with `update`, `registerParts`, `mountEffect`, `unmountEffect`, `connect` and `destroy`; `createFabRobotRig` stays as the legacy adapter over it. This turns on pointer-follow gaze in the closed state (eyes offset up to 3px, antenna lean up to 10deg) and rising binary digits from the antenna tip while working, on both the widget FAB and the site FAB.

Effects are additive and keyed: the core mounts none of its own, `mountEffect(id, mount)` hands one to the activity controller, and `connect().getEffectHostProps(id)` binds the element it renders into. `follow` accepts either one boolean or per-channel `{eyes, antenna}`. The working head bob (`yPercent -5`, `sine.inOut`) is part of the activity overlay, with head `yPercent` handed back to the pose value on a short recovery when work stops. Every art-coupled value — layer images, transform origins, origin and tip fractions, the awake eye scale, the emitter's reference antenna size — is isolated behind one optional `MascotSkin`, defaulting to `robotSkin`.

The binary emitter is scale-relative: digit size, lane offsets, digit placement and rise distance are the
approved values scaled by `min(antennaWidth, antennaHeight) / 44`, so the digits grow with the robot on a
large stage instead of staying 9px specks. The reference is the antenna layer's own box, the same frame the
tip math already works in, and it measures 44px on both the widget FAB and the site FAB, so both ship
unchanged. Rise duration, stagger and eases are timing, not geometry, and never scale.
