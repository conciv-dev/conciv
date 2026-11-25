---
'@conciv/backend-plugin-api': patch
---

Plugins get `ctx.ui.Popover`, the app's popover opened beside an element of the plugin's choosing, as a comment thread opens beside its pin. It is non-modal, so the page behind stays usable; it opens to the right of the element and flips when there is no room; Escape and a click outside close it, and focus goes back to the element. `initialFocus` names the element focused when it opens.
