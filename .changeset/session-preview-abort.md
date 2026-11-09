---
'@conciv/protocol': patch
'@conciv/harness': patch
'@conciv/core': patch
'@conciv/embed': patch
---

Arrowing through the session picker no longer piles up previews. A preview waits for the highlight to settle even while one is already open, and an abandoned preview stops reading its transcript instead of folding the whole file before the one you landed on.
