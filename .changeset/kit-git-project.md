---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`createEngine(config, {git: true})` makes the temp project a git repository with a first commit, and `engine.commit(message)` commits an edit.
