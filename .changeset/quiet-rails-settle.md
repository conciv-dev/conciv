---
'@conciv/ui-kit-chat': patch
---

Stop the trace clamp from re-laying out inside its ResizeObserver callback, which tripped a ResizeObserver notification loop and deferred the rest of each cycle's measurements during card-heavy scrolling. The trace rail no longer observes the svg it sizes and reads the gutter from its token instead.
