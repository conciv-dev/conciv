---
'@conciv/app': patch
---

`mount` resolves when the app reports it is interactive, so a route that opens the chat no longer leaves it waiting for a launcher label it never shows.
