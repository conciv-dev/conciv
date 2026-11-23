---
'@conciv/core': patch
---

Opening the sessions panel with a long history no longer holds up the engine: the session search now looks up the real location of each project folder once per pass, instead of twice for every past session it checks. Folders reached through a symlink still count as the same folder.
