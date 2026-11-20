---
'@conciv/plugin': patch
'@conciv/app': patch
'@conciv/embed': patch
---

The Terminal's model picker and New terminal button sit in a toolbar at the top of the Terminal panel, so the status bar holds only the view tabs and they no longer move when the Terminal tab opens. The `session.panel.end` slot is removed.
