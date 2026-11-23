---
'@conciv/core': patch
'@conciv/contract': patch
---

A page tool failure reaching the engine's `registry.call` passes through like any plugin tool failure: its message is the tool's own and its code is `HANDLER_ERROR`. Core no longer maps page failure codes, and the contract's `PAGE_TIMEOUT` error is gone.
