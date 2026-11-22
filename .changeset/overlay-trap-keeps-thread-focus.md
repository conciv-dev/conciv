---
'@conciv/app': patch
---

Opening a whiteboard comment thread from the inbox no longer loses it: the plugin overlay's focus trap is rebuilt only when an overlay opens or the last one closes, not on every overlay change, so a rebuild can no longer hand focus back to the inbox row and dismiss the thread.
