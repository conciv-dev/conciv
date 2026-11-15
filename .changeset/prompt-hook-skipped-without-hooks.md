---
'@conciv/chat': patch
'@conciv/core': patch
---

When no plugin has a session `prompt` hook, a send skips the hook step entirely: the message, attachments included, is not copied or compared first.
