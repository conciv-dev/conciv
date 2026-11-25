---
'@internal/frontend-defaults': patch
'@conciv/client': patch
---

A query that a rebind cancels is no longer logged as a failure: the saved-draft read and the @ list skip TanStack Query's cancel.
