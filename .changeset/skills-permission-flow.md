---
'@conciv/skills': patch
---

The conciv-debug and conciv-harness skills describe the current permission flow: every ask waits on the user's card through `permission.assert`, ends with its run, and replays from the permission service's pending list. The deleted approval store, `gatedTools` and the refuse-and-retry path are no longer taught, and stale source paths and line references are corrected.
