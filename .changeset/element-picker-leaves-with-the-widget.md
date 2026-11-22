---
'@conciv/embed': patch
'@conciv/plugin-page': patch
---

When the widget unmounts, the element picker goes with it: its keyboard handling no longer takes Escape or Enter from the host page, and a widget mounted again gets a working picker.
