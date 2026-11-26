---
'@conciv/app': patch
---

In the happy-dom project a test that leaves anything in `document.body` after cleanup fails in its own file, naming the first leftover element and pointing at `mount`, and the leftovers are removed so a later file is not blamed for them.
