---
'@conciv/backend-plugin-api': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
'@conciv/backend': patch
---

A plugin view reads its engine methods through the app's one query cache. Each method of `ctx.client.rpc(Definition)` still answers a plain call and also gives `queryOptions({input})` for `useQuery`, `mutationOptions()` for `useMutation` and `key()` to invalidate. A plugin imports `useQuery`, `useMutation` and `useQueryClient` from `@conciv/client`, which the widget provides to its bundle like Solid, and gets the app's query client with `useQueryClient()`; no plugin imports a `@tanstack/*` Query package. A method's key starts with the engine it reads from, `['plugin', {server}, id, method, input]`, so two engines never share a cached read, and `Conciv.make(raw, {server})` takes that engine's name, such as its address. When a plugin reloads or stops, the app drops every query whose key starts with `['plugin', <plugin id>]`, so a reloaded plugin never runs a chunk its old revision cached.
