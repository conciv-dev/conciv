---
'@internal/frontend-defaults': patch
---

Reopening the quick terminal right after closing a pane no longer opens the session that pane is still deleting: the delete and the resume of the latest session run in one mutation scope, in order.
