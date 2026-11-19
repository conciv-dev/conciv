---
'@conciv/plugin-whiteboard': patch
'@conciv/embed': patch
---

The thread cards for the whiteboard tools (canvas, comment, element and anchor) now ship with the whiteboard plugin and
draw through `ctx.ui`, so they show only in projects that load the plugin. A failed whiteboard call draws the app's own
failed-tool card, and the mermaid source of a diagram shows as plain text.
