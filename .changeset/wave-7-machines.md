---
'@internal/plugin-terminal': patch
'@conciv/plugin-page': patch
---

The page simulator, page attachment and terminal each run as a state machine driven by Effect, with no module globals.
