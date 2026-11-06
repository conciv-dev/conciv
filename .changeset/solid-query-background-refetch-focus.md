---
'@conciv/app': patch
---

The composer and the model search no longer lose focus when a query refreshes in the background. A temporary patch to `@tanstack/solid-query` resolves cached query data synchronously so a background refetch no longer re-suspends the surrounding view; it goes away once a solid-query release includes TanStack/query#11230.
