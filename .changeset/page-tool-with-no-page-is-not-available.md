---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/plugin-page': patch
---

Core no longer checks for an attached page before a page tool runs, and the `NO_PAGE_CLIENT` registry error is gone. With no page open, the page plugin keeps its tools out of the session, as opencode's browser plugin does, so `conciv tools page <verb>` answers that the tool is not currently available.
