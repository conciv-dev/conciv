---
'@conciv/app': patch
---

The widget saves each navigation to the engine at once instead of after 300 ms, so a reload right after closing the session menu (or any other navigation) restores what was on screen, in Firefox too.
