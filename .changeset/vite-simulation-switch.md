---
'@conciv/unplugin': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

The engine reads `CONCIV_SIMULATE` from its own config and decides whether it simulates, so a Vite dev server started with it now simulates as webpack, Rspack and Next.js do. `start` from `@conciv/backend` no longer takes a `simulation` option.
