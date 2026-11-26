---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

An agent that is slow to start is no longer failed for silence before it has started. It gets its own start limit, failing with "the agent did not start within 30s", and the silence limit ("the agent produced no output within 30s") counts from its first sign of life.
