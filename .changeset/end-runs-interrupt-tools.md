---
'@conciv/ai': patch
---

Ending a thread's runs, including at engine shutdown, now stops a run that is waiting on a tool call or a code mode program instead of waiting for the tool to return.
