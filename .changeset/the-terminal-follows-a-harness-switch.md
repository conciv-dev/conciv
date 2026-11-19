---
'@conciv/builtin-plugins': patch
---

The Terminal reads the session's model list from the same cache entry the composer refreshes on a harness switch, so switching a session to a harness without a terminal drops its Terminal tab, and a terminal never starts on the previous harness's models.
