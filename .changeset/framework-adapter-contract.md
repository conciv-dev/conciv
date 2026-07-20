---
'@conciv/protocol': patch
---

Add the shared `FrameworkAdapter` contract (`@conciv/protocol/framework-types`): a capability-typed
interface for framework inspection adapters (Next.js, TanStack Start, and future Vue/Solid/Astro),
mirroring the `HarnessAdapter` pattern so capability flags (`queryCache`, `serverFunctions`,
`rscPayload`, `isr`, `middleware`) force their gated surfaces to be present at compile time. Ships the
client (routes, navigation, data, errors) and server (manifest, events, logs) core surfaces plus the
serializable data shapes agents read (`RouteMatch`, `RouteNode`, `CacheEntry`, `HydrationSnapshot`,
`AppError`, `FrameworkEvent`, `ServerFnInfo`, …) and the `defineFrameworkAdapter` factory. Types only;
no adapter implementations yet.
