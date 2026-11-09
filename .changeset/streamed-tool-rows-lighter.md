---
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

Streamed tool runs do less work per chunk: a chunk re-runs only the trace row whose part changed (rows keyed by tool-call id, shared group tree, result pairing that only changes when a result arrives), turns are grouped once per chat, trace clamps measure from their resize observer instead of forcing a layout, tooltips mount their content only while open, and every truncated label in the thread shares one tooltip.
