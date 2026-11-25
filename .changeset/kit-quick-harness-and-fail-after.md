---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

The engine's default scripted harness is now a quick harness: it lists a fixed set of models (a `Claude` group and an `Older versions` group, with efforts), the `model` and `deploy` slash commands, and a terminal that is a plain bash shell, so the app's model picker, slash command and terminal journeys run without any CLI. `TestLLM.failAfter` gives a reply that fails part-way, as in opencode's test model, and a session's `send` now rejects with the run's error when the run fails.
