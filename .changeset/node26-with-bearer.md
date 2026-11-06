---
'@conciv/core': patch
---

Token-path requests (`/t/<token>/...`) no longer answer an empty 500 on Node 26: the engine gate rebuilds the forwarded request from its fields instead of passing the Node server's request object as the init.
