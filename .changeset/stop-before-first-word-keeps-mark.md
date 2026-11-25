---
'@conciv/backend': patch
'@conciv/ui-kit-chat': patch
---

A turn stopped before its first word is saved as an empty reply marked stopped, so the Stopped divider stays after the next message and after a reload. An assistant turn with nothing to show renders no reply article.
