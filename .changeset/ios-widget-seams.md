---
'@conciv/embed': patch
---

Add the widget-side seams that let the embedded widget behave as a native host: a host-level
`grabProvider` on `ConcivInit` (threaded to `makePaneGrabApi`, with `grabbable` reaching the composer
for a capability-driven disabled state), a `launcher: 'native' | 'mascot' | false` settings field that
gates the mascot FAB and reports `mascotRect`, programmatic `open()`/`close()`/`toggle()` handle methods
over `conciv:open-panel`/`conciv:close-panel`/`conciv:toggle-panel` events with a `bootNormal`-tolerant
open, and a public `handle.rebind(apiBase)` (plus `conciv:rebind` event) that re-points RPC/SSE on
same-core port drift while preserving nav/session state.
