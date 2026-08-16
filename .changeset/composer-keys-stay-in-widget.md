---
'@conciv/embed': patch
---

Keystrokes typed into the widget composer no longer trigger host-page hotkeys: keyboard events originating from an editable element inside the widget stop at the shadow host, so a `/` in a prompt no longer opens a docs site's search modal mid-sentence.
