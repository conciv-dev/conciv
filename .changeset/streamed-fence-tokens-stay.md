---
'@conciv/ui-kit-chat': patch
---

A code block that streams in mid-line keeps its colored lines on screen while each new chunk arrives, instead of dropping back to plain text and rebuilding every line until the next highlight lands. Streaming a long code block costs far less work per chunk.
