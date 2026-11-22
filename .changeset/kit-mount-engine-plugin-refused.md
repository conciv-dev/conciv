---
'@conciv/plugin-testkit': patch
---

`mount({plugins})` refuses a plugin with an engine part (its package exports `./server` or `./plugin-experimental`) before anything renders, and says to give it to `createEngine({plugins})`, whose engine sends its page part to the app. The by-name loader no longer imports such a package's `.` export, so its server code no longer reaches the page in browser mode.
