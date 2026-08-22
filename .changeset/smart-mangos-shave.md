---
'@conciv/app': patch
---

Widget settings view: a nested settings route under the panel with a trace-rail section nav, an
appearance section whose scheme preview tiles apply instantly, and a provenance badge that doubles as
the scope menu (apply to all projects, use global value, reset to default). Settings changes made
anywhere repaint the open widget through the settings-changed notification on the session stream.
