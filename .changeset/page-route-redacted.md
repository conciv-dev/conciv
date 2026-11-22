---
'@conciv/plugin-page': patch
---

`page_route` hides secrets in the address the same way the tab list does: a token in the query or the hash, user info, and secret route params come back as `[redacted]`.
