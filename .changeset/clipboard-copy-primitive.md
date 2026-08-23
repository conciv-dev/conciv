---
'@conciv/ui-kit-system': patch
---

One clipboard primitive behind every copy button. `createClipboardCopy` owns the copied/failed state, the reset window and the announcement text; `ClipboardCopyButton` is the opinionated presentation on top of it (tooltip icon button, copy-to-check swap, live region). Copy actions in the trace output block, the message action bar, the try-it connect pane, the terminal actions and the composer now share it, so a refused clipboard write is reported as a failure everywhere instead of being announced as a success. Trace output block actions moved out of the hover overlay into the block's own chrome row, so they are visible and reachable without a pointer and no longer sit on top of the output.
