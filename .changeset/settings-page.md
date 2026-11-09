---
'@conciv/embed': patch
---

The panel has a settings page: a gear in the session header opens it, and each tab (Appearance, Views, Shortcuts, Advanced) is its own route, so Back, reload and links land on the same tab. Color scheme and skin apply to the widget at once, the status bar follows which views are shown and their order, the quick terminal shortcuts can be recorded again, and Advanced resets everything. Settings are kept per project; values the project sets in `conciv({...})` show locked with the reason.
