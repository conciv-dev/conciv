---
'@conciv/backend': patch
---

The engine reads and writes its saved model lists, port record, dev endpoint file and staleness digests without blocking, and finds agent CLIs, the repository and the terminal helper without blocking.
