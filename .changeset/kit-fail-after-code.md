---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

`TestLLM.failAfter(error)` keeps the error's `code` on the run's RUN_ERROR, so a test can script a context overflow, and a failed `engine.session.send` carries that code.
