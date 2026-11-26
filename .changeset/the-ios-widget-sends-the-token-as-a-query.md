---
'@conciv/plugin-ios': patch
'@conciv/app': patch
---

The iOS widget logs in with the engine token as the `?conciv_auth_token=` query on its page url, as the engine accepts it, instead of a `/t/<token>` path the engine no longer serves.
