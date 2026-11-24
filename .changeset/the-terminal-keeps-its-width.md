---
'@conciv/embed': patch
---

The terminal root fills its parent's width and may shrink below its content, so a terminal inside a container that sizes to its content no longer narrows by one scrollbar width on every fit until it is two columns wide. The root and the overlay anchors are laid out with UnoCSS classes instead of inline styles.
