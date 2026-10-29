---
'@conciv/embed': patch
---

Selecting text in the chat and dragging past the edge of the panel no longer highlights the host page behind it. The selection stays inside the chat in Chromium and Firefox whatever styles the host page uses, so copying or quoting it picks up only chat text. In Firefox, moving the pointer out of the panel sideways can stretch the selection up to the top of the panel. Selecting text on the host page works as before.
