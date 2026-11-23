---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/cli': patch
---

An outside call with no session that reaches a session-bound tool now fails with the generic `NO_SESSION` ("this tool needs a session; this call has none") in place of `NO_TAB`. The hub adds "pass tab to execute_typescript; list_tabs lists the open tabs" to that reply. `code.execute` and `code.discover` refuse an unknown session id with `NOT_FOUND` ("session <id> not found") before they open a session.
