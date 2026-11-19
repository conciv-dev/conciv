---
'@conciv/plugin-ios': patch
---

The iOS plugin collects simctl output with Stream.runCollect under the same 128 MiB cap and reads the cpu for the swift target once.
