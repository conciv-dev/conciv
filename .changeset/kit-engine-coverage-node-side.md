---
'@conciv/app': patch
---

The browser-mode engine's coverage maps to its sources in CI: the kit hands it to vitest under a project that is not browser-enabled, so vitest no longer appends its browser marker to the engine's built files, which hid their source maps.
