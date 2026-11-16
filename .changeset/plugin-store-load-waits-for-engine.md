---
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/plugin': patch
---

A plugin whose store load meets a lost engine connection waits for the engine and starts once it returns, instead of staying failed. An engine error on that load still fails the plugin.
