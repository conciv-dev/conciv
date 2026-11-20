---
'@conciv/plugin-host': patch
---

The dev server exits promptly on stop: file watches on files in one directory share one native watch handle, so the plugin host closes one handle per watched directory instead of one per watched file.
