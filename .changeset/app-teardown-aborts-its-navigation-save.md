---
'@conciv/app': patch
---

Disposing the app right after a navigation no longer warns that the navigation could not be saved: the app's own teardown aborted that save.
