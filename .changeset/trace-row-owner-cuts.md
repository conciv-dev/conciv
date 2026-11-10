---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/embed': patch
---

Tool rows and their result bodies build a fraction of the reactive work they used to. A copy button inside the thread shares the thread's one tooltip and builds its icon swap on first hover or focus, and the row, card and output layers derive each value once.
