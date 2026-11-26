---
'@conciv/app': patch
---

The page highlight draws in the page plugin's `ctx.overlay` layer, under the widget, with the widget's font and color scheme, in place of its own shadow root over the page.

A plugin overlay follows the widget's color mode and skin when they differ from the system's: the scheme and skin classes now sit on the overlay's host, where the color tokens resolve.
