---
'@conciv/solid-streamdown': patch
'@conciv/ui-kit-chat': patch
---

Code blocks in chat replies no longer flip between plain and colored text while a reply streams in: lines that are already colored stay colored and only the newly arrived code is added. Selecting text inside a code block now survives the reply re-rendering around it, so you can copy from a block while the agent is still writing.
