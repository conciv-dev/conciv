---
'@conciv/plugin-testkit': patch
---

The kit's browser and happy-dom test projects add their own UnoCSS plugin only when the package's vite config has none, so an app with UnoCSS in its config no longer runs two.
