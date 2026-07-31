---
'@conciv/embed': patch
---

Widget navigation is no longer clobbered by a slow write. The widget now stamps each navigation write with the moment the navigation happened and the server keeps only the newest one, so a request that gets delayed on the network can no longer resurrect a view the user already left. A freshly loaded page continues from the stored stamp, so it still wins over a write the page it replaced left in flight, and the server ignores stamps more than a day ahead of its own clock so a badly wrong client clock cannot wedge navigation saving.
