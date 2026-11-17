---
'@conciv/extension-page': patch
---

`@conciv/extension-page` has no browser entry any more: the `./client` export and the `browser` condition on `.` are gone, with the old simulator (`mountSimulator`, `endRun`, `endTask`) they carried. `.` and `./server` give the engine extension that adds the grab attachment; `./defs` and `./capture-plugins` stay. The page tools, their cards and the agent cursor come from the built-in page plugin.
