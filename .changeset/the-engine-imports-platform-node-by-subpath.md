---
'@conciv/core': patch
'@conciv/plugin-host': patch
---

The engine imports `@effect/platform-node` by subpath instead of the barrel, so starting it loads about 770 fewer modules (a redis client among them) and imports about 300 ms sooner.
