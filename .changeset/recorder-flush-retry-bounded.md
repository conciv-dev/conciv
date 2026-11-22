---
'@conciv/plugin-recorder': patch
---

A failing flush gives up after three retries and keeps its events for the next flush, so Export and Send to agent show their error toast instead of hanging while the engine fails.
