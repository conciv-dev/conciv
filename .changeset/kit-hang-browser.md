---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

In browser mode `engine.reply` takes `TestLLM.hang()`: it crosses to the engine as a marker and becomes `hang()` there.
