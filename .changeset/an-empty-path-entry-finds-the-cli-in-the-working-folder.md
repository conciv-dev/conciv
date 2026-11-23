---
'@conciv/harness': patch
'@conciv/core': patch
---

An empty PATH entry counts as the working folder when checking whether a CLI is installed, as the spawn itself does, so a `claude` reached that way is no longer reported as not installed.
