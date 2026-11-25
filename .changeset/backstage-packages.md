---
'@conciv/backend': patch
---

Packages follow one layered map: the engine is `@conciv/backend` (was `@conciv/core`), the widget bundle is `@conciv/app` (was `@conciv/embed`), the plugin SDK is split into `@conciv/backend-plugin-api` and `@conciv/frontend-plugin-api` (was `@conciv/plugin`), the engine contract and schemas are `@conciv/protocol` (was `@conciv/contract`), the wire types are `@conciv/types` (was `@conciv/protocol`), the plugin host is `@conciv/backend-app-api` (was `@conciv/plugin-host`), and `@conciv/harness-init` is `@conciv/harness/init/*`. Tests run with plain `vitest run`.
