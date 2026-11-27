---
'@conciv/unplugin': patch
---

The dev server no longer asks vite to pre-bundle `partial-json` through the removed `@conciv/ai` package, so the dev log loses its "could not resolve" line.
