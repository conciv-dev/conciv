---
'@conciv/mascot': patch
---

Restructure the mascot internals into a composable core (config, path, pose/follow/activity controllers, binary effect, tip transition) behind a new `createMascot` service with `update`, `registerParts`, `connect` and `destroy`. `createFabRobotRig` stays as the legacy adapter over that core, so the widget FAB and the site keep their existing closed/open/work states. Behavior is verified against the previous implementation on the emitter, antenna, eyes and gaze channels; the head bob the old work timeline carried is intentionally dropped. Adds a checked-in real-Chromium behavior harness (`pnpm --filter @conciv/mascot verify:behavior`) covering the legacy states plus the new lifecycle, reduced-motion, gaze-falloff and re-registration guarantees.
