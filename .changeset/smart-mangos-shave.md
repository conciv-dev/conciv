---
'@conciv/ui-kit-system': patch
'@conciv/extension-testkit': patch
'@conciv/client': patch
'@conciv/app': patch
---

Widget settings view: a nested settings route under the panel with a trace-rail section nav, an
appearance section whose scheme preview tiles apply instantly, and a provenance badge that doubles as
the scope menu. Ordinary edits always write the project layer, so a value inherited from the global
layer visibly moves to this project when you change it and the global value stays put for your other
projects; the badge menu applies a value to all projects through the single `settings.applyGlobally`
server op, forks a global value back to this project, or resets to the default. Reads come from one
`settings.get` call that carries per-layer provenance and revisions, every write sends the layer
revision it expects, and a revision conflict reloads the settings and says so instead of clobbering
them. Settings changes made anywhere repaint the open widget through the settings-changed
notification on the session stream. SegmentGroup gains a `plain` variant so a consumer can render
fully custom items without the segmented-control chrome.
