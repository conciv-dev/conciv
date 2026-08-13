---
'@conciv/app': patch
---

Extension instance disposal is now owned by `createConcivRouter` itself: a `Wrap` component registers `onCleanup` for every extension instance's `dispose()`, riding whatever unmounts the tree that rendered `RouterProvider`. The `disposeConcivRouter` export is gone, along with every ad hoc disposer array that paired a manual call with unmount — they were forgettable by construction, and every consumer that forgot leaked extension state.
