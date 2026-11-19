---
'@conciv/ui-kit-chat': patch
---

The kit Chip's `maxWidth?: 'full' | 'compact'` prop becomes `compact?: boolean`, and `ctx.ui.Chip` takes the same `compact` prop: a compact chip is capped at a short width, cut with an ellipsis, and shows its full value in a tooltip.
