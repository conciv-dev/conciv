---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

The test engines take `env`, `timings`, policies, extra harnesses and the quick harness's model and command lists, give `engine.files` to read and write a project file while the engine runs, and give each session `answer` for a UI question and `switchHarness`; the plugin-testkit engine also gives its `address`, in node, happy-dom and browser mode.
