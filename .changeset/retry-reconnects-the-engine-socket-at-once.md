---
'@conciv/protocol': patch
'@conciv/app': patch
---

A Retry click while the engine socket waits to try again reconnects it at once instead of waiting out the back-off, and the Retry reconnects before it checks the login again.
