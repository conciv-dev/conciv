---
'@conciv/embed': patch
---

The widget's Escape handling no longer looks for the terminal's DOM: a key the terminal handles (it marks Escape handled) is left alone through the event's `defaultPrevented`, as any plugin's key is.
