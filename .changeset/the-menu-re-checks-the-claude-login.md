---
'@conciv/harness': patch
'@conciv/types': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

Opening the model menu or switching a model or harness re-checks the Claude login in the background, whether the held answer says logged in or not, so a `claude auth logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer and starts nothing.
