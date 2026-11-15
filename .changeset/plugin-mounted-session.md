---
'@conciv/app': patch
'@conciv/plugin': patch
---

The widget builds the routed session and its composer as plugins see them: `Composer.text`, `insert`, `setText` (no longer declared only) and `focus` act on the chat pane's composer, and writes made before the session's draft loads wait and apply in call order.
