---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

A package whose tests call the kit's `cli()` gets `@conciv/cli` built before its tests run.
