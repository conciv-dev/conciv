---
'@conciv/extension': patch
---

Node extension RPC clients now stop a stream when its abort signal fires, even after the fetch Request has been garbage collected.
