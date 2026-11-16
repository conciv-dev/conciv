---
'@conciv/contract': patch
'@conciv/client': patch
---

A slow dev server is no longer shown as a lost one. The widget now waits up to 30 seconds for the engine to accept its connection, instead of 2, so "conciv lost connection to the engine." only shows when the connection really fails, and an engine that is slow to connect still gets its live updates. If the engine is too slow to answer the login check, the widget asks again every 10 seconds, so "Log in to use conciv on this page." shows once it answers.
