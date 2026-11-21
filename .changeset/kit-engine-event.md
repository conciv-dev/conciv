---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

A test waits for an engine event: `await engine.event(type)` resolves once the engine's event stream is live, and its `arrived` gives the first event of that type as `{type, data}`, with no polling. A wait still open when the engine stops is refused with "the engine stopped", and one nobody awaits stays silent.
