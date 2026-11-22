---
'@conciv/ui-kit-chat': patch
---

A reply that runs a tool before it writes text keeps its place on screen when the text arrives: the trace the user hid stays hidden, opened tool cards stay open and focus stays on the control the user pressed. The chat library renames the reply's message when its text starts, and the thread no longer treats that as a new reply.
