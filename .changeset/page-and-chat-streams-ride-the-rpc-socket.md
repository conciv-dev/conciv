---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/client': patch
'@conciv/protocol': patch
'@conciv/embed': patch
---

The widget's page queries and session events ride the one `/rpc-ws` socket: `page.queries({focus})` opens with a `ready` that names the browser tab, `page.focus` keeps the tab focused last as the target of page queries, and the separate `/push-ws` socket is gone.
