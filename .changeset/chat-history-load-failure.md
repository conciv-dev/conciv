---
'@conciv/ai': patch
'@conciv/embed': patch
---

A chat whose history fails to load now shows the error with a Retry button instead of a loading skeleton that never ends, and Retry loads the history again. The loading state comes from TanStack AI's `isHydrating`.
