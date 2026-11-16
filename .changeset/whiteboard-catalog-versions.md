---
'@conciv/extension-whiteboard': patch
---

`@conciv/extension-whiteboard` now takes `@libsql/client`, `@takumi-rs/core` and `@takumi-rs/helpers` from the workspace catalog. `@libsql/client` stays at 0.18.0. `@takumi-rs/core` and `@takumi-rs/helpers` move from 2.18.2 to 2.20.0: both whiteboard packages use them, and the publish guard requires one catalog version for a dependency shared by two packages.
