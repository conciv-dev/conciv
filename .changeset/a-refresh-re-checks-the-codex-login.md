---
'@conciv/harness': patch
---

Opening the model menu or switching a model or harness re-runs `codex login status` even after a logged-in answer, so a `codex logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer.
