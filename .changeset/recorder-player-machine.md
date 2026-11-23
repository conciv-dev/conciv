---
'@conciv/plugin-recorder': patch
---

The Recorder's live replay keeps its live/following state in a plain machine driven by Effect, and its wait-for-mount and resize frame loops run as Effect programs disposed with the player. The plugin makes its own Effect runtime in setup and disposes it on cleanup.
