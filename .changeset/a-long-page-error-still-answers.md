---
'@conciv/embed': patch
'@conciv/plugin-page': patch
---

A page action whose handler fails with a very long error now answers the agent with that error, cut to 2,048 characters, instead of sending a reply its own schema refuses and leaving the agent with a wrong timeout.
