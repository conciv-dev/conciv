---
'@conciv/client': patch
'@conciv/embed': patch
---

Fix #532: an idle widget on the fetch transport now notices the engine refusing new connections. `engineProbeRefetchInterval` takes a `heartbeat` condition alongside `reachable`; while reachable and the heartbeat condition holds (fetch transport, panel open) the existing engine-meta query polls every 30s instead of going silent, so a refused connection surfaces the standing offline notice without requiring the user to attempt an action first.
