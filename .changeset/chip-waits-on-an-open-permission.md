---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The session status chip says WAITING while a permission card is open. `SessionStatusInput` takes `approvalPending`, and the chat pane sets it from the session's pending approvals, as opencode marks a session with an open permission request as waiting for approval.
