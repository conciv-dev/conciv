---
'@conciv/cli': patch
---

`conciv tools` run in a shell inside the project folder no longer raises an Approve card for asking tools; the in-widget agent's own CLI and a CLI that found its engine through the home db are still asked.
