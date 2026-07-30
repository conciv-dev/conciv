---
'@conciv/protocol': patch
'@conciv/session-presence': patch
---

Sessions store a per-session transcript cwd plus attached process id/time, and harness session ids are now unique. Adds `@conciv/session-presence`: the session presence state machine plus transcript file watch and transcript mirror shared by core and the terminal extension.
