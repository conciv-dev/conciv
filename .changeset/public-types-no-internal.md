---
'@conciv/app': patch
'@conciv/plugin-whiteboard': patch
---

The published types of `@conciv/app` and `@conciv/plugin-whiteboard` no longer import the private `@internal/*` packages. Each package now ships one bundled declaration file per public entry, built by tsdown, instead of a declaration file for every source file.
