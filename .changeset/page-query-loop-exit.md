---
'@conciv/client': patch
---

A page query loop that stops early, by returning or breaking out of its iterator, now tells the server the socket no longer serves page queries, so a chat stream that keeps the socket open does not leave page tools waiting for a reply that never comes.
