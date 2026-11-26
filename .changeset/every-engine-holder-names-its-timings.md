---
'@conciv/protocol': patch
'@conciv/client': patch
'@conciv/backend-plugin-api': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

Every holder of an engine connection takes the engine timings, so a widget with engine timings set keeps one socket per api base, and the embed init forwards timings to the app.
