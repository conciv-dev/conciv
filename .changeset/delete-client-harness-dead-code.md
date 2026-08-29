---
'@conciv/harness': patch
'@conciv/protocol': patch
---

Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
`uninstall()` outside the deleted `claude/attach.ts` and its own test.
