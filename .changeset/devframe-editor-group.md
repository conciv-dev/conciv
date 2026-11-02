---
'@conciv/core': patch
'@conciv/app': patch
---

The editor procedures (open and openFromFrames) are also served as conciv:editor:* hub functions beside oRPC. The widget opens files in the editor over the hub, and its hub calls carry the active session so session-scoped functions run in that session, as the oRPC session header did.
