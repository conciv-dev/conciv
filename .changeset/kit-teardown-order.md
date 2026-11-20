---
'@conciv/plugin-testkit': patch
---

The happy-dom `./browser` fixtures tear down quietly: `mount` waits until every page socket routed through the engine proxy has closed and every engine call has its answer, and the forked engine child stops through an explicit stop call, sending nothing after it answers. A call made after the stop rejects with a clear error.
