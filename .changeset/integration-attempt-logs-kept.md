---
'@conciv/backend-app-api': patch
---

A sign-in attempt that runs on after its request (a sign-in command, an automatic OAuth callback) logs through the engine's own logger instead of the finished request's, so its warnings ("authentication command failed", "integration attempt failed") reach the engine logs instead of being dropped.
