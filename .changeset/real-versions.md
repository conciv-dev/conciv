---
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/extension': patch
'@conciv/harness-init': patch
'@conciv/protocol': patch
---

Packages now report their real release version. `conciv --version` prints it, the Claude Code connect plugin is stamped with it instead of `0.0.0`, every engine response carries an `x-conciv-version` header, and the rpc clients send their own version in the same header so the engine can tell which client it is talking to.
