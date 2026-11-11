---
'@conciv/extension': patch
'@conciv/core': patch
---

An extension now learns when conciv refuses an outside agent's call to one of its tools. A tool can declare oRPC middleware with `defineTool(...).use(middleware)`, for example `.use(onError((error, {path, context}, input) => ...))`. When the user denies an outside agent access to the tab, or does not approve an `approval: 'ask'` tool, the refusal is thrown inside the tool's own procedure, so that middleware sees it with the tool name, the input, the session id and the extension's server context.
