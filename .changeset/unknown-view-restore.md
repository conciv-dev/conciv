---
'@conciv/embed': patch
---

Restoring a persisted panel route whose extension view is no longer mounted now lands on the chat view instead of rendering an empty pane. The `/panel/$sessionId/$view` route canonicalizes an unknown view id in `beforeLoad` with a replacing redirect to `/panel/$sessionId`, mirroring how `/panel/$sessionId` already canonicalizes an unadopted harness session id.
