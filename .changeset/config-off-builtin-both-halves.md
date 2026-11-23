---
'@conciv/app': patch
'@conciv/plugin': patch
---

A built-in turned off in the engine config (`plugins: ['-conciv.page']`) is listed with the state `disabled`, and the app keeps its window part off too, whatever the Settings rows say, so one entry turns off both halves of the page plugin.
