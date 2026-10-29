---
'@conciv/db': patch
'@conciv/core': patch
---

Run records move to a Drizzle `RunStore` on the `@tanstack/ai-persistence` schema. One durable record now describes a run for both conciv and the library, replacing the parallel `runs` table bookkeeping. A user stop records the cancel through `requestRunCancel` and aborts with `RUN_CANCEL_REASON`, so it is distinguishable from a dropped client, and boot cleanup is a sweep over `listReclaimable` instead of a blanket abort.
