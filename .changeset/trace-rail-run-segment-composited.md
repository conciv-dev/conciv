---
'@conciv/ui-kit-chat': patch
---

The trace rail's running segment slides with compositor-only translations instead of a clip-path transition, so a streaming run no longer repaints and re-layerizes the whole thread on every frame while the segment travels.
