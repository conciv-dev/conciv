---
'@conciv/app': patch
'@conciv/plugin': patch
---

A built-in turned off in the engine config (`plugins: ['-conciv.page']`) is absent from the engine's plugin list, as in opencode. The app reads that absence for a window built-in it knows has an engine half (`BUILTINS_WITH_ENGINE_HALF`) and keeps its window part off too, whatever the Settings rows say, so one entry turns off both halves of the page plugin.
