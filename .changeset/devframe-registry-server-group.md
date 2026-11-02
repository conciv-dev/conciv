---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/app': patch
---

The registry and server procedures are also served as conciv:registry:* and conciv:server:* hub functions beside oRPC, and the widget reads the tool catalog over the hub. A logged-in browser tab skips the approval ask on registry calls and on server reload and restart, as the widget origin does on oRPC today; any other hub caller, including the engine token, still gets the ask.
