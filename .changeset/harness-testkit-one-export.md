---
'@conciv/harness-testkit': patch
---

`@conciv/harness-testkit` now has one export, `createHarnessEngine`, which starts the real engine itself with a scripted chat for a given harness or a fake one, and the `./until`, `./rpc-mounts` and `./node` entries are gone along with the older helpers; `@conciv/plugin-testkit` builds its `createEngine` on it.
