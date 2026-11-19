---
'@conciv/db': patch
---

The draft items migration now runs after the page-table drop, so a database that already applied the drop still gains the drafts items column.
