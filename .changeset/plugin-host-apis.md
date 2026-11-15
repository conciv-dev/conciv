---
'@conciv/app': patch
'@conciv/plugin': patch
---

The widget builds a browser plugin's host APIs: stores, toasts, the clipboard, downloads, external links, the editor, the one engine as a server, the app's route and theme, and panel views opened through the route. `System.save` and `System.openExternal` are implemented; `Layout.draft` opens a draft only on the engine, in its project root.
