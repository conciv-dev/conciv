---
'@conciv/ui-kit-chat': patch
---

Fix a long main-thread frame when a pane opens on a session with a large restored transcript: the viewport resize/font-ready estimator reset and virtualizer remeasure now schedule via `requestAnimationFrame` instead of running inline in the resize observer callback, so the expensive text-metrics recompute lands in its own frame instead of blocking alongside the `MESSAGES_SNAPSHOT` websocket handler.
