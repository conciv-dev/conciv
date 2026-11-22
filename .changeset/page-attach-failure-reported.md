---
'@conciv/plugin-page': patch
---

When the page cannot attach to the session (the engine refuses it, the page runs another conciv version, or the attach breaks), the widget now shows an error toast saying what to do instead of leaving page tools silently not working.
