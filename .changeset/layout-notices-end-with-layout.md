---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

The "pop-out window could not be reopened" notice and the "lost connection to the engine" notice now go away when the panel, quick terminal or picture-in-picture view that raised them closes. Before, opening the quick terminal from the panel kept the panel's pop-out notice on screen, and its button acted for a panel that was already gone.
