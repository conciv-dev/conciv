---
'@conciv/ui-kit-system': patch
---

A `VirtualList` row keeps its node when a refetch moves it to another place in the list, so a session picker row clicked while the list reorders still opens that session instead of losing the click.
