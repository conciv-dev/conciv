---
'@conciv/core': patch
'@conciv/chat': patch
---

A page queue follow-up turn now counts as delivered only when its run finishes. A follow-up run that ends in RUN_ERROR, such as a harness launch failure, gives its queue results back to be delivered by the next follow-up. After three failed follow-ups for a queue the engine stops starting follow-ups for it, logs the queue id with the last error once, and the result is delivered with the session's next agent reply.
