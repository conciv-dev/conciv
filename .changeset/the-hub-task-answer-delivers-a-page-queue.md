---
'@conciv/plugin-page': patch
'@conciv/core': patch
---

The hub's `page.queue.wait` hands a finished queue result over with the page plugin's `queue.wait`, which marks it delivered at the hand-over: the hub task answer is the delivery. The plugin's `queue.claim` and `queue.settle` methods and the `claimed` delivery state are gone, and core no longer holds a result until the hub's reply goes out.
