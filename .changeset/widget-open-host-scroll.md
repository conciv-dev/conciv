---
'@conciv/embed': patch
---

Stop the widget from scrolling the host page to the top. TanStack Router installs its scroll handler on every client router even with `scrollRestoration` unset, and `resetScroll` defaults to `true`, so every panel navigation ran `window.scrollTo(0, 0)` on the embedding page — opening the widget yanked the host site back to the top. The widget router now opts out globally with `scrollRestoration: () => false`, which also covers the `history.back()` paths (Escape-close, quick-terminal close) that a per-navigation `resetScroll` cannot reach. The widget never relied on router scroll restoration: its own scrolling is element-level.
