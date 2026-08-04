---
'@conciv/core': patch
---

Clean-room rewrite of the chat stack: the client rides `@tanstack/ai` subscribe/send/stop with server-stamped runIds, core rebuilds around six small chat modules with a MESSAGES_SNAPSHOT-led wire, and the composer moves into ui-kit-chat with draft persistence and refresh. The old bridge/epoch/adopt machinery is deleted and banned from the codebase by lint.
