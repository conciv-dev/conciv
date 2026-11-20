---
'@conciv/embed': patch
---

The Terminal keeps the session's model list in its own cache entry under the one the composer refreshes on a harness switch, so the refresh reaches it: switching a session to a harness without a terminal drops its Terminal tab, and a terminal never starts on the previous harness's models. The composer's own model list is never fetched through the Terminal, so a Terminal read cannot hold the composer's send.
