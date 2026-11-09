---
'@conciv/ui-kit-chat': patch
---

A streamed chunk that only changes a tool's arguments or output no longer re-runs the trace row's collapsible bindings, header line and body frame, and the trace rail redraws inside its resize observer instead of forcing a style and layout flush on the next frame.
