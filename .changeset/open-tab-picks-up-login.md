---
'@conciv/client': patch
---

A tab that is already open signs in when another tab of the same browser signs in. The engine token is kept per browser in `localStorage`, but a tab only read it when it started, so an open tab stayed on "Unauthorized" until it was reloaded. The connection now listens for the token's `storage` event and checks the stored token again.
