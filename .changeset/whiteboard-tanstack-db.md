---
'@conciv/extension-whiteboard': patch
---

Replace the Jazz CRDT backend with an in-process drizzle/libSQL database, explicit zod-validated
REST routes, an SSE change feed, and TanStack DB query-collections in the client. No more Jazz
sync server, deploy step, or secrets; conflict policy is server-ordered per-element versioned
last-writer-wins.
