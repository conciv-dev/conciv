---
'@conciv/contract': patch
'@conciv/embed': patch
---

Reloading while the dev server is still starting no longer leaves conciv cut off until another reload; logging in again after a revoke works on the first try. During a dev-server restart the panel may show the "couldn't reach the engine" screen sooner than before, and it now recovers on its own once the server is back. Logging in while conciv is still checking the connection no longer logs the page out a moment later.
