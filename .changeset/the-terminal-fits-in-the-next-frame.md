---
'@conciv/embed': patch
---

The terminal screen fits to a new size in the animation frame after the resize is observed, not inside the observer callback, so a fit that changes the screen's own size no longer makes the browser report "ResizeObserver loop completed with undelivered notifications".
