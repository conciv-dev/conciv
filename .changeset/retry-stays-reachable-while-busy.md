---
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

When the Terminal's model list failed to load while the CLI is busy, the selector still opens and its Retry lists the models; picking a model still waits until the CLI is idle.
