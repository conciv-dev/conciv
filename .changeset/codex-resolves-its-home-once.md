---
'@conciv/harness': patch
---

Listing Codex sessions looks up the real location of the Codex home folder once per list instead of once for every session, and does it without blocking the engine. A Codex home reached through a symlink still lists its sessions, and a session whose transcript lies outside the home is still left out.
