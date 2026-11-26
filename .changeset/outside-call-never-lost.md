---
'@conciv/backend': patch
'@conciv/client': patch
---

An outside agent's tool call no longer goes missing from a panel that connects while the call runs or just after it, when no turn is running: the engine listens before it answers the panel's event subscription, saves each part of the call to the chat before it sends it out (as one message, the same id live and after a reload), and the panel reloads its history once its event stream is live.
