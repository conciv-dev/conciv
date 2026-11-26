---
'@conciv/app': patch
---

Coverage counts the engine of a browser-mode test: it runs in vitest's main process, where vitest collects nothing, so the kit takes V8 coverage there and hands it to vitest's provider at the end of each file.
