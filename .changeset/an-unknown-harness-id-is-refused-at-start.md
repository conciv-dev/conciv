---
'@conciv/backend': patch
'@conciv/try': patch
---

A `harness` option or `CONCIV_HARNESS` value that no registered harness has now stops the engine from starting, with `conciv: unknown harness "<id>". Known harnesses: claude, codex, gemini-cli, opencode, pi.`, before any port is bound. Before, the engine started on claude without a word, so a typo in the harness name went unnoticed. `conciv-try --harness` names the same registered harnesses instead of a fixed list. With no harness given, claude is still the default.
