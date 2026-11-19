---
'@conciv/solid': patch
'@conciv/mascot': patch
---

@conciv/solid and @conciv/mascot need Solid 1: their solid-js peer range is now ^1.8 instead of >=1.8, so a Solid 2 app gets a clear peer warning instead of a broken install.
