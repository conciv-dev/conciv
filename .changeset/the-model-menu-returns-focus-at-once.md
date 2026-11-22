---
'@conciv/embed': patch
'@conciv/ui-kit-tap': patch
---

Closing the composer's model menu (a pick, Escape or a click outside it) gives the composer its focus back at once, instead of leaving it on the page for two frames. The rich text field's `focus()` now focuses the editor at once.
