---
'@conciv/protocol': patch
'@conciv/plugin': patch
'@conciv/core': patch
'@conciv/ui-kit-chat': patch
---

The Terminal panel is built in. A session whose harness has a terminal command lists a Terminal tab in the status bar; opening it starts the harness CLI in a terminal that survives a reload, and while it is shown the status bar carries a model picker (the pick is remembered) and a New terminal button. `session.panel.end` is ported: a plugin slot drawn at the end of the status bar's view tabs. `HarnessMeta.persistentPty` is new: `meta.models` and `meta.harnesses` say whether the harness has a terminal. The model picker's list keeps its own width and stays on screen when its trigger sits near the edge of the window. The model picker's button and list use the chat sans face and type scale, matching the status bar tabs beside them. The terminal uses the widget's mono font.
