---
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/contract': patch
'@conciv/embed': patch
---

Typing @ in the composer offers the session's plugin tools again, next to the extension tools. The tool list now comes per session (`meta.tools` takes a `sessionId`), from the same place the turn gets its plugin tools, so a tool that a session's permissions turn off is not offered. Tool calls from plugin tools also get their clean names in the chat history.
