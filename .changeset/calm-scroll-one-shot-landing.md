---
'@conciv/ui-kit-chat': patch
---

Chat thread: land on the latest turn with a single scroll write instead of the virtualizer's `scrollToEnd`, which armed a five-second reconcile loop that dragged a reader back whenever they scrolled up right after mount or right after sending.
