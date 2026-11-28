---
'@conciv/cli': patch
---

`conciv mcp connect`, `disconnect` and `serve` name the agent you typed when it has no conciv hub connection, and list the agents that have one, instead of printing the `<AGENT>` placeholder. Every positional argument error now starts with the argument's name instead of its usage placeholder.
