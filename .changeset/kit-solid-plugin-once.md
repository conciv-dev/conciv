---
'@conciv/plugin-testkit': patch
---

The happy-dom and browser test projects no longer add a second Solid plugin when the package's own vite config already has one, so each source file is compiled once.
