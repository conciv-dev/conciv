---
'@conciv/contract': patch
---

The browser rpc connection takes engine connection timings, merged over defaultEngineConnectionTimings, and connections with different timings never share a socket.
