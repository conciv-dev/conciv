---
'@conciv/core': patch
---

Adapter streams that emit a RUN_ERROR chunk (stub harnesses, acp adapters) now settle the run with a visible error instead of finishing silently with an empty message.
