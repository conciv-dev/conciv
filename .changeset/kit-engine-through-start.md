---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

The test engine starts through core's `start`, the way the dev server does: it takes the product's config defaults, writes `server.json` and the connect file in its temp root, and registers in its own home, so the CLI finds it.
