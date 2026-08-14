---
'@conciv/mascot': patch
---

Restructure the mascot internals into a composable core (config, path, pose/follow/activity controllers, binary effect, tip transition) behind a new `createMascot` service with `update`, `registerParts`, `connect` and `destroy`. `createFabRobotRig` stays as the legacy adapter over that core.

This changes what both consumers render. The rig that shipped on `main` had no pointer-follow gaze and no binary emitter; this merge turns both on for the widget FAB and the site FAB. The closed state now tracks the pointer (eyes offset up to 3px, antenna lean up to 10deg) and the work state now emits rising binary digits from the antenna tip.

Parity was measured against the PR #486 prototype on the donor branch — the implementation this core was ported from — not against the rig previously on `main`. It covers the emitter, antenna, eyes and gaze channels; the head bob the donor's work timeline carried is intentionally dropped.

Adds a checked-in real-Chromium behavior harness (`pnpm --filter @conciv/mascot verify:behavior`) covering the legacy states plus the new lifecycle, reduced-motion, gaze-falloff, registration-contract and re-registration guarantees.
