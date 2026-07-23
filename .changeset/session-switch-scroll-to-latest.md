---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

Switching sessions (and reloading) now lands the widget transcript at the latest message. Root cause: after navigation the router re-inserts the pane subtree into the panel, which silently resets the chat viewport's scrollTop to 0 (no scroll event fires, and the resize dedupe cache swallowed the recovery), leaving the thread stuck at the top with a stale at-bottom state. The thread auto-scroll now watches its root for host re-insertions and restores the tracked scroll position (re-asserting bottom when pinned). The styled Thread also exposes the viewport scroll options (`scroll` prop) and the widget enables scroll-to-bottom on initialize and on thread switch. The pane snapshot no longer persists scrollTop; a reload lands at the latest message like any other open.
