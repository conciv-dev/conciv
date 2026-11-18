---
'@conciv/plugin-host': patch
---

A project plugin's built files are watched once per file, and every load that asks for the same file waits until its watch is ready.
