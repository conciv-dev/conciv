---
'@conciv/ui-kit-system': patch
---

One reduced-motion signal: ui-kit-system's prefersReducedMotion is reactive (createMediaQuery in one root) and every motion check in ui-kit-chat, the page plugin and the app reads it instead of its own matchMedia.
