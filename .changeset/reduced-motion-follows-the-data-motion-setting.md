---
'@conciv/ui-kit-system': patch
---

`prefersReducedMotion` reads a `data-motion` attribute on the document root (`reduce` or `full`) before the system setting, and the new `observeReducedMotion(listener)` calls the listener when either one changes, as opencode's motion helper does.
