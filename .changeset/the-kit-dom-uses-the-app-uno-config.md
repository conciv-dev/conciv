---
'@conciv/plugin-testkit': patch
'@conciv/app': patch
---

The plugin-testkit happy-dom project loads the app's own UnoCSS config, so class-hidden UI reads hidden there. The app's UnoCSS filesystem globs resolve from the config file, so any project that loads it scans the same sources.
