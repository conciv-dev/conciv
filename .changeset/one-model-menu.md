---
'@conciv/embed': patch
'@conciv/core': patch
'@conciv/harness': patch
'@conciv/ai': patch
---

One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.

The model menu is searchable: typing in its search field filters every model of every harness by model name, id or harness name (older versions and long lists included), arrows and Enter pick, Escape clears the search and then closes. With an empty search each harness shows its main models and says how many more a search reaches. OpenCode lists one row per model (its region routes such as `us.`/`eu.`/`global.` collapse to one) and only what OpenCode itself can run; a harness with nothing usable says so, and an empty live model list now replaces the saved one instead of being treated as a failure.
