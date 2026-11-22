---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

The test engine no longer reads the developer's environment: provider keys, secrets and every `CONCIV_*` variable are taken out, and `HOME`, the XDG folders and `TMPDIR` point inside the engine's own state folder. A test adds or replaces variables with the new `env` option.
