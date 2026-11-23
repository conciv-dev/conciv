---
'@conciv/plugin': patch
'@conciv/core': patch
---

Outside agents' tool calls run as a hidden `outside` agent (`Agent.outsideId`), so a plugin tool can tell an outside agent's call from the session's; its permissions are the session agent's, as before.
