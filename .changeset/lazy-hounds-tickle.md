---
'@conciv/embed': patch
---

Widget navigation is no longer clobbered by a slow write. The widget now stamps each navigation write with the moment the navigation happened and the server keeps only the newest one, so a request that gets delayed on the network can no longer resurrect a view the user already left.
