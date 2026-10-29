---
'@conciv/ui-kit-chat': patch
---

Bind the thread virtualizer to its scroll element only once that element is in the document. A
virtualized transcript re-entered through a view tab used to come back blank: the virtualizer
resolved its target window while the subtree was still detached, cached a null one, and never
recomputed a range. The scroll element is now reported only while connected, and the binding runs
again whenever it resizes.
