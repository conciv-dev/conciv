---
'@conciv/plugin-recorder': patch
---

The recorder's action log no longer repeats the text of a node the page moved. A node the page adds again under another parent now moves there, as rrweb replays it, so a click is logged as `clicked body "Cart Buy"` and not `clicked body "Buy Cart Buy"`. A node added again with a different tag still replaces the id, and the old node stays where it was.
