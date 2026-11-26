---
'@conciv/protocol': patch
'@conciv/client': patch
'@internal/frontend-defaults': patch
---

An error thrown while the panel renders shows its own message instead of "conciv couldn't reach the engine", and its Retry no longer resets the engine connection. Only a failure of the engine connection itself counts as an unreachable engine: `@conciv/protocol` marks those failures with `engineUnreachable` and tells them apart with `isEngineUnreachable`, and `isReachabilityError` checks only that mark, so a draft save is no longer retried for an error that is not a connection failure.
