---
'@conciv/solid-streamdown': patch
---

An inline-code path the host confirmed through `localFileExists` is now a tab stop with link semantics when `openLocalFile` is set: Tab reaches it, and Enter or Space opens it through `openLocalFile` exactly as a click does. With `localFileExists` alone the path is marked as before and is not focusable.
