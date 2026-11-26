---
'@conciv/app': patch
---

`@internal/frontend-defaults` and `@internal/uno-preset` are no longer peer dependencies of the kit: the published kit names no private package. `mount` and `concivTest()` need the app, so they work only inside the conciv repo until the app is published; `createEngine` from `@conciv/plugin-testkit/node` works anywhere.
