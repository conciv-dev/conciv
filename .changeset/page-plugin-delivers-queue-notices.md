---
'@conciv/plugin-page': patch
'@conciv/core': patch
---

The page plugin tells the session itself when a queue it started finishes (one `Queued page actions <status>` message), and holds a queue an outside agent started for that agent, read once through the new `queue.outside` rpc method. Core no longer reads or delivers page queues: `code.execute` lists no queues and `page.queue.wait` answers `NO_QUEUE`.
