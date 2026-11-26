---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

`engine.outside({client?, tab?})` makes an outside agent's call the way the conciv hub does, over the engine's `code.*` rpc, and answers with the hub's own reply; `hubAccess` sets the engine's outside-agent access.
