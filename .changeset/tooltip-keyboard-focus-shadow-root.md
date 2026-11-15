---
'@conciv/ui-kit-system': patch
---

A tooltip now opens when keyboard focus moves onto its trigger inside a shadow root, as in the widget, and closes again on Escape or when focus moves on. The trigger's focus handlers were bound through Solid's document-level event delegation, and a focus move between two elements of one shadow root never reaches the document. This also covers a trigger that wraps a focusable child (`asChild` on a span), such as a plugin's `Ui.Tooltip`.
