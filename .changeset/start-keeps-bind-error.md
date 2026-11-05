---
'@conciv/core': patch
---

When the engine cannot bind its port, start now fails with the bind error (such as EADDRINUSE) and logs a failing extension cleanup, nested errors included, instead of reporting the cleanup failure in its place.
