---
'@conciv/core': patch
'@conciv/chat': patch
---

A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, is retried with a short backoff, three attempts in all. A follow-up declined because a run is already driving is not retried. When every attempt fails the engine logs the queue ids with the last error once and starts no more follow-ups for those queues; their results are delivered with the session's next agent reply.
