---
'@conciv/plugin': patch
'@conciv/app': patch
'@conciv/embed': patch
---

A plugin view reads its engine methods through the app's one query cache. Each method of `ctx.client.rpc(Definition)` still answers a plain call and also gives `queryOptions({input})` for `useQuery`, `mutationOptions()` for `useMutation` and `key()` to invalidate. `ctx.queryClient` is the app's query client, and a plugin bundle imports `@tanstack/solid-query` from the app like it imports Solid.
