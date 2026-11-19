---
'@conciv/builtin-plugins': patch
---

The Terminal keeps its model pick per session: picking a model in one session leaves the others on their own pick, so coming back to a session shows the model its CLI runs. With no saved pick, a new terminal starts its CLI on the model its picker shows (the harness default, as the chat composer does).
