---
'@conciv/ui-kit-system': patch
---

New `Loader` compound (`Loader.Root/Indicator/Text/Label/Description`) built on Ark's indeterminate Progress: a conic-gradient orb whose arcs animate registered `@property` angles rather than rotating a rasterized texture, drawn entirely in `currentColor` so it inherits any surface. Sizes ride a `--pw-loader-size` variable through `data-size`, and `Loader.Indicator` renders whatever children it is given, so a different visual replaces one part instead of the component. Styled entirely through the shared `@conciv/uno-preset` (keyframes, a `data-size` rule and shortcuts), like every other component in the package — no separate stylesheet to `@import`.
