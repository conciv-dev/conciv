---
'@conciv/harness': patch
---

The Claude probe that lists the models and slash commands and checks the login now starts the same `claude` the turn runs, from PATH, instead of the copy bundled with the Agent SDK. A probe whose CLI never answers its start gives up after 30 seconds, the way opencode's does, so a turn never waits on it forever.
