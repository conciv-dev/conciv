---
'@conciv/simulation': patch
---

`conciv-test` runs vitest in its own process group, sends a stop signal to that whole group, and removes its temporary home only once every process of the run is gone, so a test worker that outlives vitest after a stop no longer writes into a home that was already removed.
