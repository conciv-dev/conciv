---
'@conciv/ai': patch
'@conciv/embed': patch
---

A chat whose history fails to load now says "Couldn’t load this conversation" with a Retry button instead of a loading skeleton that never ends; the empty-chat welcome stays hidden, Retry shows as busy while it reloads, and a Retry that fails again is announced. The loading state comes from TanStack AI's `isHydrating`.
