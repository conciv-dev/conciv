---
'@conciv/harness': patch
---

Listing Claude sessions no longer re-reads every transcript on each call. Each listed transcript keeps an incremental reader that folds only the lines appended since the previous list, and keeps only the session facts the list shows, not the messages. Readers for transcripts that fall out of the newest 50 are dropped.
