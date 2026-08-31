---
'@conciv/ui-kit-chat': patch
---

Restore the narration line to the widget's trace language: a braille spinner glyph in the accent color plus a mono micro label at the trace gutter, with no fill slab. The line now rides as the last row of the running turn's chain group, animates the label swap when the activity changes, and freezes the glyph at `⠿` under `prefers-reduced-motion`. The pinned copy above the composer is kept as the late-join fallback.
