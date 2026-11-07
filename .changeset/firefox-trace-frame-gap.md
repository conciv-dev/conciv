---
'@conciv/ui-kit-chat': patch
---

Streaming a long tool run no longer forces a layout read on every chunk: the last-turn flag and the virtualizer's turn count and keys only notify when their values change, so the trace rail and the thread scroller stop re-measuring each streamed chunk (Firefox dropped frames).
