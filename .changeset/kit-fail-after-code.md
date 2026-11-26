---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

`TestLLM.failAfter(error)` keeps the error's `code` on the run's RUN_ERROR, so a test can script a context overflow, and a failed `engine.session.send` carries that code.
