---
'@conciv/backend': patch
---

conciv starts again in a project whose dev server died while the agent was answering. Before, every later start failed with `ReferenceError: Cannot access 'plane' before initialization` until the project's conciv state was removed; now the cut turn shows as stopped and the engine starts.
