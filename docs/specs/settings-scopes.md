# Settings scopes: global and project

Status: approved by Omri 2026-11-11. Builds on `settings-storage.md` (one file per scope and namespace, read once,
debounced write) and `settings-extensions.md` (generated extension pages).

## What the user gets

- A sticky switch at the top of the settings page, above the scrolling body, on every tab:
  `This project | All projects`. Kit `SegmentGroup` (Ark).
- `This project` (default) shows and edits the project file (`<project>/.conciv/settings/<namespace>.json`).
- `All projects` shows and edits the global file (`<concivHome>/settings/<namespace>.json`).
- The choice is a search param on the settings layout route, so a reload keeps it.

## Which value applies

- Applied value = project over global over defaults.
- Merge with `defu` (unjs), the same layering c12 and unconfig use: `merge(project, global)`, leftmost wins,
  nested objects merge per key, `undefined`/`null` and missing keys fall through to the next layer.
- One deviation from plain `defu`: arrays replace, never concatenate. Built with `createDefu` from `defu`
  itself: when the higher layer holds an array, it is the value. (A project shortcut `['Mod+K']` replaces the
  global one; it never yields both.) VS Code merges settings layers the same way.
- Defaults come from the zod schema parse after the merge (`PreferencesSchema.parse`, `extension.parseSettings`),
  as today. Defaults are never written to a file.
- One merge function, `mergeSettings` in `@conciv/extension`, used by `defineExtension().useSettings()` (so a
  running extension applies project over global over defaults), `create-preferences.ts` and the extension
  settings form. No merge in the engine; the engine keeps one store per file (Devframe's shape).

## What each view shows

- `This project`: every field shows the applied value. A field with no project value but a global one carries a
  small "From all projects" note. Resetting a field there deletes only the project key, so the global value (or
  the default) applies again.
- `All projects`: every field shows the global value (or the default). Editing writes the global file. A field
  that this project overrides carries a "This project overrides it" note, since the change will not apply here.
- Where a value came from is decided by key presence in each file, never by comparing values.
- Writing a value equal to what applies without that key in the edited file deletes the key: in `This project`
  that is the global value over the default, in `All projects` the default. A file only holds keys that change
  something.
- Advanced "Reset all" clears the file of the selected scope only, and its confirmation text names that scope.

## Reads

- The app subscribes to both files per namespace (`settings.changes` with `scope: 'project'` and
  `scope: 'global'`), the existing live queries. Pending or failed global read: the page waits/fails exactly like
  the project read does today.

## Out of scope

- Live pickup of changes made by another engine or by hand (settings files are read once; restart picks them up).
- Per-field scope menus. The switch is page-wide.
