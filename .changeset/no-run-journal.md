---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
'@conciv/skills': patch
---

An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

`createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.
