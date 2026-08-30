---
'@conciv/ui-kit-chat': patch
---

The chat thread survives a viewport re-insertion. When an ancestor of the thread viewport is removed and re-inserted — a Solid `Suspense` above the pane re-suspending on a session switch, for instance — the browser discards the scroll offset, and the reset used to reach the scroll owner looking exactly like a reader dragging to the top. The owner now records a resting anchor (preserve the reader's position, or resume following the end) and restores it through the single landing call site when the viewport comes back.
