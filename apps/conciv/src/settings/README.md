# settings

## Overview

The conciv preferences a user changes on the settings page, and one generated page per extension that declares `settings`: their schema, the store they live in (namespace `conciv`, `project` scope of the Devframe-contract settings store), and the TanStack Form wiring that edits them through the `@conciv/ui-kit-system` controls.

## Interface

- `PreferencesSchema`, `Preferences`, `PreferenceKeySchema`, `PREFERENCE_DEFAULTS`, `ShortcutCommand`, `SHORTCUT_DEFAULTS`, `PreferencesApi` (`preferences-schema.ts`): `colorScheme` (`page` | `light` | `dark`), `skin`, `launcher` (`mascot` | `native` | `hidden`), `openOnLoad`, `closeOnOutsideClick`, `docksHidden`, `docksPinned`, `docksCustomOrder`, `commandShortcuts` (Devframe's hub user settings shapes; a command missing from `commandShortcuts` keeps its default, an empty list turns it off)
- `createPreferences(options)` (`create-preferences.ts`): reads the stored snapshot through the live `settings.changes` query, writes through the store from `getHostApi().useScope('conciv').settings.project`; `shortcut(command)` resolves host value, then stored value, then default; `shortcutLock(command)` names why a shortcut is read-only; `launcher()` and `openOnLoad()` prefer the value the host passed to `conciv()`, and `lock(key)` names that lock; `reset(keys)` deletes some keys, `clear()` all
- `arrangeViews(views, arrangement)` (`arrange-views.ts`): orders views pinned first (`docksPinned`), then by `docksCustomOrder` (unlisted views keep their place), and drops `docksHidden`
- `PreferencesForm` (`preferences-form.tsx`): loading, error with Retry, then one form over the stored values; every change saves through a mutation, and a failed save shows on the field
- `useAppForm` (`app-form.ts`): the one `createFormHook` form hook, with every field component below
- `extensionSettingsPage(extension)` (`extension-fields.ts`): the extension's page title (its name, humanised) and one field per `settings` key: `z.boolean()` a switch, `z.enum` a segment (up to 3 options) or a select, `z.number()` a number input (min, max, whole-number step from the schema), `z.string()` a text input; label is `meta.title` (else the key, humanised), hint is `meta.description`
- `ExtensionSettingsForm` (`extension-settings-form.tsx`): the page of the extension the `/settings/extensions/$name` route resolved: live snapshot of its `project` settings, one `Group` titled with the extension, fields saved on change through `getHostApi().useScope(name).settings.project`
- `fieldContext`, `formContext`, `useFieldContext` (`form-context.ts`): the form hook contexts
- `Group`, `SettingRow`, `ActionRow`, `SettingsLoad` and the shared class names (`settings-ui.tsx`): a section card with title and description, one labelled row (kit `FieldPrimitive`, hint, lock reason, error), a row with a trailing action, loading / error with Retry / content for a settings query
- `SegmentField`, `SkinField`, `SelectField`, `SwitchField`, `NumberField`, `TextField` (`setting-fields.tsx`): the form's field components over kit `SegmentGroup`, `RadioGroupPrimitive` cards with a live skin preview, `Select`, `Switch`, `NumberInput` and `TextField`
- `ViewsList`, `ViewRow` (`views-list.tsx`): one row per view: show checkbox, pin, reorder by drag or Alt+ArrowUp/Down on the grip; an order equal to the natural order is stored as `{}`
- `ShortcutsList` (`shortcuts-list.tsx`): one row per command; clicking the name records keys (`createHotkeyRecorder`), Esc cancels, a key already used by another command asks before moving it
- `readLastTab`, `writeLastTab`, `SETTINGS_TAB_ROUTES` (`last-tab.ts`): the settings tab last opened in this browser (`localStorage` key `conciv:settings-tab`, JSON): a built-in tab id or `{extension: name}`

## Invariants

- `create-preferences.ts:write`: a value equal to its default deletes the key instead of storing it
- `preferences-schema.ts:PreferencesSchema`: every field has a default and a catch, so a malformed stored value reads as the default
- `preferences-form.tsx:createPreferencesForm`: the form follows the stored snapshot until a field is touched
- `extension-settings-form.tsx:createExtensionForm`: a value that fails its schema field is not saved and shows on the field; a value equal to the field default deletes the key
- `extension-fields.ts:extensionSettingsPage`: computed once per extension; fields with no control are skipped and named in one `console.warn`
- `last-tab.ts:readLastTab`: an unreadable value reads as `general`; an extension that is gone redirects to General from its route

## Side Effects

- `create-preferences.ts:createPreferences`: subscribes to `settings.changes` for `{scope: 'project', namespace: 'conciv'}`; writes call `settings.set` / `settings.delete`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root
