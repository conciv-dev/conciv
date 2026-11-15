# settings

## Overview

The conciv preferences a user changes on the settings page, and one generated page per extension that declares `settings`: their schema, the two stores they live in (namespace `conciv`, the `project` and `global` scopes of the Devframe-contract settings store, applied project over global over defaults), and the TanStack Form wiring that edits them through the `@conciv/ui-kit-system` controls.

## Interface

- `PreferencesSchema`, `Preferences`, `PreferenceKeySchema`, `ShortcutCommand`, `SHORTCUT_DEFAULTS`, `PreferencesApi` (`preferences-schema.ts`): `colorScheme` (`page` | `light` | `dark`), `skin`, `launcher` (`mascot` | `native` | `hidden`), `openOnLoad`, `closeOnOutsideClick`, `docksHidden`, `docksPinned`, `docksCustomOrder`, `commandShortcuts` (Devframe's hub user settings shapes; a command missing from `commandShortcuts` keeps its default, an empty list turns it off)
- `createSettingsLayers(options)` (`create-settings-layers.ts`): the live `settings.changes` queries of one namespace in both scopes; `status()`/`retry()` cover both, `applied()` is `@conciv/extension`'s `mergeSettings(project, global)`, `shown(scope)` is what a scope's page shows (project: the applied values; global: the global file), `fallthrough(scope)` is what applies when the edited file lacks a key (project: the global file; global: nothing), `note(scope, key, entry?)` is "From all projects" for a project-view key only the global file holds and "This project overrides it" for a global-view key the project file holds (key presence, never value comparison); with `entry` it asks the same of one entry of a record-valued key (one command of `commandShortcuts`), since the two files merge per entry
- `createPreferences(options)` (`create-preferences.ts`): the `conciv` namespace over `createSettingsLayers`, writing through `getHostApi().useScope('conciv').settings[scope]`; `stored()` is the applied preferences, `shown(scope)` and `note(scope, key, entry?)` feed the settings page; `shortcut(command, scope)` resolves host value, then the scope's value, then default; `shortcutLock(command)` names why a shortcut is read-only; `launcher()` and `openOnLoad()` prefer the value the host passed to `conciv()`, and `lock(key)` names that lock; `reset(scope, keys)` deletes some keys, `clear(scope)` deletes every key that scope's store holds (read from the store, not the snapshot); the Advanced tab's per-part resets call `reset`, and the `/settings/advanced/reset` confirmation route calls `clear`, both on the scope the page shows
- `settingsSearchSchema` (`settings-search-schemas.ts`): the settings layout's `scope` search param, `project` (default, stripped from the URL) or `global`
- `SCOPE_NAMES` (`scope-names.ts`): each scope as a phrase (`for this project`, `for all projects`) for the Advanced tab's reset copy
- `SettingNote` (`setting-note.ts`): context the forms provide with the note of a key (or of one entry of a record-valued key); `SettingRow` shows its field's note beside the label, `Group` the first note of its `keys` beside the title, and each shortcut row the note of its own command, on one line that truncates, so a note never adds a line
- `arrangeViews(views, arrangement)` (`arrange-views.ts`): orders views pinned first (`docksPinned`), then by `docksCustomOrder` (unlisted views keep their place), and drops `docksHidden`
- `PreferencesForm` (`preferences-form.tsx`): loading, error with Retry, then one form over the values of the scope in the settings layout's `scope` search param (rebuilt per scope, keyed on the `scope` param, with `shown(scope)` as its default values, TanStack Form's keyed-remount pattern; saves go to the form's scope); every change saves to that scope through a mutation, and a failed save shows on the field
- `useAppForm` (`app-form.ts`): the one `createFormHook` form hook, with every field component below
- `extensionSettingsPage(extension)` (`extension-fields.ts`): the extension's page title (its name, humanised) and one field per `settings` key: `z.boolean()` a switch, `z.enum` a segment (up to 3 options) or a select, `z.number()` a number input (min, max, whole-number step from the schema), `z.string()` a text input; label is `meta.title` (else the key, humanised), hint is `meta.description`
- `ExtensionSettingsForm` (`extension-settings-form.tsx`): the page of the extension the `/settings/extensions/$name` route resolved: its settings in both scopes through `createSettingsLayers`, one `Group` titled with the extension over the scope the layout's `scope` param selects (rebuilt per scope, keyed on the `scope` param), fields saved on change through `getHostApi().useScope(name).settings[scope]`
- `fieldContext`, `formContext`, `useFieldContext` (`form-context.ts`): the form hook contexts
- `Group`, `SettingRow`, `ActionRow`, `Badge`, `SettingsLoad` and the shared class names (`settings-ui.tsx`): a section card with title and description, one labelled row (kit `FieldPrimitive`, hint, lock reason, error), a row with an optional leading icon and a trailing action, a small outlined label beside a row's name, loading / error with Retry / content for a settings query
- `SegmentField`, `SkinField`, `SelectField`, `SwitchField`, `NumberField`, `TextField` (`setting-fields.tsx`): the form's field components over kit `SegmentGroup`, `RadioGroupPrimitive` cards with a live skin preview (`shown` displays the page's `--conciv-skin` while it locks the field, without touching the stored choice), `Select`, `Switch`, `NumberInput` and `TextField`
- `ViewsList`, `ViewRow` (`views-list.tsx`): one row per view: show checkbox, pin, reorder by drag or Alt+ArrowUp/Down on the grip; an order equal to the natural order is stored as `{}`
- `ShortcutsList` (`shortcuts-list.tsx`): one row per command; clicking the name records keys (`createHotkeyRecorder`), Esc cancels (from the row or the conflict warning), a key already used by another command asks before moving it, and a key used by a host-locked command cannot be moved
- `readLastTab`, `writeLastTab`, `SETTINGS_TAB_ROUTES` (`last-tab.ts`): the settings tab last entered in this browser (`localStorage` key `conciv:settings-tab`, JSON): a built-in tab id (`general`, `views`, `shortcuts`, `plugins`, `advanced`) or `{extension: name}`, written by each tab route's `onEnter`, so tab clicks, Back/Forward and deep links all count

## Invariants

- `create-preferences.ts:write`: a value equal to what applies without the key in the edited file (project: global over defaults; global: the default) deletes the key instead of storing it; `commandShortcuts` is written per entry: only entries that differ from the lower layer (or the default) are kept, so editing one command never freezes the others
- `preferences-schema.ts:PreferencesSchema`: every field has a default and a catch, so a malformed stored value reads as the default
- `preferences-form.tsx:createPreferencesForm`: the form follows the stored snapshot until a field is touched
- `extension-settings-form.tsx:createExtensionForm`: a value that fails its schema field is not saved and shows on the field; a value equal to what applies without the key in the edited file deletes the key
- `extension-fields.ts:extensionSettingsPage`: computed once per extension; fields with no control are skipped and named in one `console.warn`
- `last-tab.ts:readLastTab`: an unreadable value reads as `general`; an extension that is gone redirects to General from its route

## Side Effects

- `create-settings-layers.ts:createSettingsLayers`: subscribes to `settings.changes` for `{scope: 'project', namespace}` and `{scope: 'global', namespace}`; writes call `settings.set` / `settings.delete` on the selected scope

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root
