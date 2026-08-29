---
'@conciv/harness': patch
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/ui-kit-chat': patch
---

Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
`uninstall()` outside the deleted `claude/attach.ts` and its own test.

Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
`@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
packages already depend on.

`@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
(`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
dependency.
