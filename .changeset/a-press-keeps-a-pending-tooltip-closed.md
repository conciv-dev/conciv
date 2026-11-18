---
'@conciv/ui-kit-system': patch
'@conciv/embed': patch
---

A pointer press on a tooltip trigger before its tooltip opens now cancels the pending open, and the tooltip stays closed while the button is held, so dragging a whiteboard pin no longer shows its label mid-drag. Whiteboard pins sit under the chat panel, and the chat hides while the pin drift prompt is open.
