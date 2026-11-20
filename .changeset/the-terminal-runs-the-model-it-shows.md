---
'@conciv/embed': patch
---

The Terminal keeps its model pick per session: picking a model in one session leaves the others on their own pick, so coming back to a session shows the model its CLI runs. A new session, with no pick of its own, starts from the last model the user picked in any session, as opencode does. With no pick at all, a new terminal starts its CLI on the model its picker shows (the harness default, as the chat composer does).
