---
'@conciv/solid-streamdown': patch
---

A fence view gets a `fallback()`: calling it, or throwing while it renders, shows that fence as plain code until the fence's code changes.

A `highlightCode` result can be a `FencedView` (`{view, fallback}`), so a fence whose view falls back shows the highlighted code or another view in its place.
