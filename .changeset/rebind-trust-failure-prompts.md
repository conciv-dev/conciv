---
'@conciv/app': patch
'@conciv/contract': patch
---

A rebind normalizes the engine base once where it enters the app, so `/health` and the other derived urls no longer get a doubled slash, and a trust check the engine answers with 401 locks the connection and asks to authorize instead of reading as unreachable.
