---
'@internal/frontend-defaults': patch
---

The panel resolves its routed session before it loads: a restored session the engine swept as empty is created again instead of failing with "session not found", and a deleted session opens the latest one.
