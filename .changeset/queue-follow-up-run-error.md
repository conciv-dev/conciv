---
'@conciv/core': patch
'@conciv/chat': patch
---

A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, is retried with a short backoff, three attempts in all. A follow-up declined because a run is already driving is not retried, and neither is a follow-up run the user stops. When every attempt fails, or the user stops the run, the engine starts no further follow-up for those results on its own: they are handed over by the session's next conciv tool reply, or carried by the next follow-up turn another finished queue starts, whichever comes first. Exhausted retries are logged once with the queue ids and the last error.
