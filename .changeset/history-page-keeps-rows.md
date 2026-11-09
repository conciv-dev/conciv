---
'@conciv/ui-kit-chat': patch
---

An older page landing keeps the turns already on screen: a virtual row finds its turn by key instead of by index, so a prepend no longer rebuilds every visible turn and replays its fade-in from blank.
