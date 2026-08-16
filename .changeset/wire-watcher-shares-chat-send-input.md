---
'@conciv/contract': patch
---

Export `ChatSendInput` so the rpc wire watcher asserts against the real `chat.send` schema instead of a looser copy.
