---
'@conciv/harness-testkit': patch
---

engine.session.stop() stops the runs the test started without first reading the session, so a stop while a turn still prepares its prompt no longer waits on that turn.
