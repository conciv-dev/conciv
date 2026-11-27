---
'@conciv/cli': patch
---

`conciv init` in a Next.js project whose app lives in `src/app` or `src/pages` writes `instrumentation.ts` and `instrumentation-client.ts` into `src/`, where Next.js reads them, instead of the project root.
