---
'@conciv/core': patch
---

Stop cancels only the runs the client saw: `chat.stop` takes `runIds`, so a stop that lands after the next turn was claimed (Escape or the stop button with queued messages) no longer cancels that next turn. The flush now waits for the stop to be acknowledged before it sends.

A stop also cancels a run whose viewer already disconnected: the run keeps watching for a recorded cancel until it ends, instead of waiting out the 15s settle timeout.
