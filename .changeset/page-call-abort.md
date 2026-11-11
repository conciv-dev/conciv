---
'@conciv/core': patch
---

A page call stops the moment its caller gives up: a cancelled outside-agent call, a stopped chat run, an aborted `registry.call`, or an `execute_typescript` program that ends with the call still running. The engine drops the waiting page query at once instead of waiting out its timeout, and never resends it after an abort.
