---
'@conciv/ui-kit-system': patch
'@conciv/client': patch
'@conciv/app': patch
---

Widget settings view: a nested settings route under the panel with a trace-rail section nav, an
appearance section whose scheme preview tiles apply instantly, and a provenance badge that doubles as
the scope menu. Writes follow provenance, so editing a globally-scoped value stays global and the
badge menu can fork it back to this project. Settings changes made anywhere repaint the open widget
through the settings-changed notification on the session stream. SegmentGroup gains a `plain` variant
so a consumer can render fully custom items without the segmented-control chrome.
