---
'@conciv/plugin-testkit': patch
---

The happy-dom and browser test projects skip their own Solid plugin only when the package's vite config has a Solid plugin that runs while testing, not a build-only one such as the one in `experimental()`, so a plugin package's mounted app has its JSX compiled again.
