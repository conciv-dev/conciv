---
'@conciv/app': patch
---

Plugin global and project settings are kept in this browser. Plugins start before a core is connected, and the installed plugin list loads once the widget connects to a core.

Project settings are kept apart per project and load once a core is connected. When this browser's storage is full, older plugin settings make room first; if nothing can be saved, a notice says so once.
