---
'@conciv/ui-kit-chat': patch
---

The thread virtualizer rounds turn height estimates to whole pixels, so a reader who scrolled up no longer shifts by a fraction of a pixel when rows above the viewport get their first real measurement.
