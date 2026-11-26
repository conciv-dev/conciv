---
'@conciv/protocol': patch
---

The browser engine connection runs on Effect: a pure machine owns the reconnect back-off and the trust rules, and a scoped driver runs the socket over `effect/socket`. partysocket is gone from the contract, and so are the unused `engineHeaders` and `engineWebSocket`.
