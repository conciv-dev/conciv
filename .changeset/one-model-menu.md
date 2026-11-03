---
'@conciv/embed': patch
'@conciv/core': patch
'@conciv/harness': patch
'@conciv/ai': patch
---

One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.
