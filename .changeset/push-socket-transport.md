---
'@conciv/core': patch
---

One thin per-tab push socket now carries server-push traffic: page queries and out-of-band session events ride `/push-ws`, and every request/response call stays on oRPC over fetch.
