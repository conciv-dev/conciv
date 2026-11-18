---
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/core': patch
'@conciv/plugin': patch
'@conciv/embed': patch
---

Typing `@` in the composer lists the engine's skills, then its agents that are neither primary nor hidden, in one list named `Context` for screen readers, as opencode's composer does. The engine answers them through the new `skill.list` and `agent.list` calls; `meta.tools` and the extension tool list behind the old `Tools` mention list are gone.
