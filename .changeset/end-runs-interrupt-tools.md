---
'@conciv/ai': patch
---

Ending a thread's runs, including at engine shutdown, now stops a run that is waiting on a tool call or a code mode program instead of waiting for the tool to return. A new message that ends the running turn still lets that turn finish cleanly for its viewer.
