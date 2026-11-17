---
'@conciv/plugin-page': patch
---

A page action with a wrong value now says which values it accepts. For example, `conciv tools page wait` with an unknown `--state` lists the states you can use, instead of only "Invalid input".
