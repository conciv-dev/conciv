---
'@conciv/app': patch
---

Extension instance disposal is now owned by `createConcivRouter` itself: a `Wrap` component registers `onCleanup` for every extension instance's `dispose()`, riding whatever unmounts the tree that rendered `RouterProvider`. The three `apps/conciv` browser suites that used to pair `disposeConcivRouter` with a manual unmount no longer need to — they were forgettable by construction, and every consumer that forgot leaked extension state.

`disposeConcivRouter` stays exported as an explicit, idempotent escape hatch for the one case `Wrap` can't cover: a router created but never rendered (e.g. a boot that fails before `render()` runs) still needs an owner for its eagerly-created extension instances. It shares one guarded disposer with `Wrap`'s `onCleanup` — first call disposes, every later call (whether from a normal unmount or a repeat call) is a no-op — so `packages/embed/src/mount-impl.tsx` can keep calling it unconditionally in its disposer list without double-disposing.
