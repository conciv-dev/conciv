---
'@conciv/plugin-page': patch
'@conciv/backend-plugin-api': patch
'@conciv/app': patch
'@conciv/backend': patch
---

A plugin runs its own operation on the page tab: its browser half adds a `PageOperation` and its engine half calls `page.operate` through `ctx.rpc(Definition)`. The page plugin and its browser half run on Effect; a closed tab ends a call in flight as `tab_gone`, a reading call is resent once to the next tab, and a refused attach stops retrying.
