---
'@conciv/plugin-page': patch
---

A page queue wait that ends because the queue finished cancels its timer, so a stopped engine leaves no timer running.
