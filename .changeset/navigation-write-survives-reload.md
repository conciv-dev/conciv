---
'@conciv/embed': patch
'@conciv/contract': patch
---

A navigation made right before a reload or tab close is no longer lost. The widget flushes its pending navigation write when the page turns hidden and sends it as a keepalive request, so a reload restores the screen the user just saw: picking a session and reloading at once no longer brings the session menu back open.
