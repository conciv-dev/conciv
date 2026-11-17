---
'@conciv/plugin-page': patch
---

The page plugin's RPC contract gains `symbolicate`: given stack frames from the page, the engine answers the source file, line and column they point to in the project, or `null` when none of them maps inside it.
