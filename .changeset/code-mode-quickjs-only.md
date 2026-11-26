---
'@conciv/backend': patch
---

Code mode runs in the QuickJS sandbox on every platform. conciv no longer installs the native `isolated-vm` addon, so there is one install script fewer to decide and nothing to compile.
