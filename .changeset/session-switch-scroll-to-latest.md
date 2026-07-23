---
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

Switching sessions in the widget now lands the transcript at the latest message. Root cause: after navigation the router re-inserts the pane subtree into the panel, which silently resets the chat viewport's scrollTop to 0 (no scroll event fires, and the resize dedupe cache swallowed the recovery), leaving the thread stuck at the top with a stale at-bottom state. The thread auto-scroll now watches its root for host re-insertions and restores the tracked scroll position (re-asserting bottom when pinned). The styled Thread also exposes the viewport scroll options (`scroll` prop), the widget enables scroll-to-bottom on initialize and on thread switch, and the pane snapshot's scrollTop restore is scoped to page reloads via a per-page-load token so same-page session switches always show the latest message.
