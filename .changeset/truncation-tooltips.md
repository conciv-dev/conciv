---
'@conciv/ui-kit-system': patch
---

Clipped text now reveals its full content in a tooltip. A new `TruncatedText` primitive measures its own
box when the tooltip is asked to open, so only text that is actually cut off grows a reveal; text that
fits stays quiet. Adopted across the trace rows, tool card headlines, value chips, page-session steps,
the panel title, the status bar view labels, and the session selector, whose bar variant also no longer
lets a long session title escape the popover.
