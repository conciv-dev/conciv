---
'@conciv/app': patch
'@conciv/plugin': patch
---

A served plugin turned off in the engine config (`plugins: ['-@conciv/plugin-page']`) is absent from the engine's plugin list, as in opencode, so the app loads neither of its halves.
