---
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/app': patch
---

Serve the navigation procedures as `conciv:navigation:*` hub functions beside oRPC, sharing one implementation. The widget routes the navigation group over the hub; the embed's navigation storage stays on oRPC until the oRPC removal.
