---
'@conciv/backend': patch
'@conciv/plugin-page': patch
'@conciv/types': patch
---

A finished queued page list reaches its session through `session.synthetic`, as opencode's background jobs report: the result arrives as a "Queued page actions <status>" notice that wakes an idle session, or waits for a live run to end. The engine's own page-queue follow-up turn, its `'page-queue'` turn kind and the `conciv.page-queue` chat event are gone, and the agent's in-chat code replies no longer repeat finished queue results (hub replies still carry them).
