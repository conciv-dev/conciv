---
'@conciv/extension': patch
---

The host API no longer offers `useComposerInsert`, `useOpenEditor` or `usePopover`: no extension used them, so the widget stops wiring them.
