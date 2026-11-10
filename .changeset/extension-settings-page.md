---
'@conciv/extension': patch
'@conciv/embed': patch
---

Extensions declare their user settings once, as a zod object in `defineExtension({settings})` (every field needs a `.default()`, `.meta({title, description})` labels it), plus an optional `icon`. The settings page adds a tab for each such extension with one control per field, saved per project. The extension reads the parsed values live with `useSettings()` on the client and `ServerApi.settings` on the server; Advanced resets every extension's settings.
