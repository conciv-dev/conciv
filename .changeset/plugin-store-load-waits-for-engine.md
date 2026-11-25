---
'@internal/frontend-defaults': patch
'@conciv/app': patch
'@conciv/backend-plugin-api': patch
'@conciv/protocol': patch
---

A plugin whose store load meets a lost engine connection waits for the engine and starts once it returns, instead of staying failed. An engine error on that load still fails the plugin.

A browser rpc call whose caller passes its own `shouldRetry` still stops retrying once its connection is closed.
