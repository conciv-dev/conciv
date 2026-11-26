---
'@conciv/backend-plugin-api': patch
---

The `Page` contract gains `pick()`: the page plugin lets the user pick an element on the page, in grab's quiet comment mode, and resolves its `source` and `rect`, or `null` when the user presses Escape. A second `pick` cancels the one in flight.
