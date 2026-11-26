---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A draft typed and reloaded at once is back in the composer in Chromium even while another tab holds the draft database: the page keeps a copy in sessionStorage when it is left. A tab that loads before it is trusted no longer empties the drafts every other tab keeps in this browser; only a revoked trust does.
