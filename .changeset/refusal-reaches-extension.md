---
'@conciv/extension': patch
'@conciv/core': patch
---

An extension now learns when conciv refuses an outside agent's call to one of its tools. Its `.server()` factory can return an oRPC `middleware` next to `context`, for example `onError((error, {path, context}, input) => ...)`, and conciv runs it around every tool the extension owns. When the user denies an outside agent access to the tab, or does not approve an `approval: 'ask'` tool, the refusal is thrown inside the tool's own procedure, so that middleware sees it with the tool name, the input and the session id.
