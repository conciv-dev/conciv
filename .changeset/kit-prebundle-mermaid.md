---
'@conciv/plugin-testkit': patch
---

Browser tests prebundle mermaid, so the first diagram in a run does not load it module by module through Vite.
