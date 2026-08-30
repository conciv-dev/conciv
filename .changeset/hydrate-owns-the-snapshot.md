---
'@conciv/core': patch
---

`chat.hydrate` is the only place a client asks for a thread: a run no longer appends the whole transcript to its own stream, so a turn carries only what it produces. The compact turn drives itself through the same turn path every other run uses, and `RunController` leaves the chat path with it.
