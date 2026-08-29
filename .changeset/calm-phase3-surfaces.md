---
'@conciv/ui-kit-chat': patch
'@conciv/extension-page': patch
'@conciv/core': patch
---

Calm surfaces: a streaming activity now gets one surface that is born once, streams into itself, and settles in place. Completed surfaces stay open and inspectable until the next prompt is sent, page-session grouping is minted once per part and only reclassified once the run settles, and the server keeps the user message id the client minted so a prompt row is never remounted mid-thread.
