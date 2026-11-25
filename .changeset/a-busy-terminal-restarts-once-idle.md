---
'@conciv/app': patch
---

When the model list arrives while the CLI is busy and the saved pick differs from the model the CLI runs, the Terminal restarts on the saved pick once the CLI is idle, instead of never.
