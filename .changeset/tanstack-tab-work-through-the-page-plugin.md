---
'@conciv/plugin-tanstack': patch
'@conciv/app': patch
---

The TanStack plugin reaches the tab only through the page plugin: its browser operations run as page operations, its tab tools follow the page grant and the page tab IDs, and its own tab connection is gone. The page tab url hides secret router path params too.
