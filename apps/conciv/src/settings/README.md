# settings

## Overview

The conciv preferences a user changes on the settings page: their schema, the store they live in (namespace `conciv`, `project` scope of the Devframe-contract settings store), and the TanStack Form wiring that edits them through the `@conciv/ui-kit-system` controls.

## Interface

- `PreferencesSchema`, `Preferences`, `PreferenceKeySchema`, `PREFERENCE_DEFAULTS`, `ShortcutCommand`, `SHORTCUT_DEFAULTS`, `PreferencesApi` (`preferences-schema.ts`): `colorScheme` (`page` | `light` | `dark`), `skin`, `launcher` (`mascot` | `native` | `hidden`), `openOnLoad`, `closeOnOutsideClick`, `docksHidden`, `docksPinned`, `docksCustomOrder`, `commandShortcuts` (Devframe's hub user settings shapes; a command missing from `commandShortcuts` keeps its default, an empty list turns it off)
- `createPreferences(options)` (`create-preferences.ts`): reads the stored snapshot through the live `settings.changes` query, writes through the store from `getHostApi().useScope('conciv').settings.project`; `shortcut(command)` resolves host value, then stored value, then default; `shortcutLock(command)` names why a shortcut is read-only; `launcher()` and `openOnLoad()` prefer the value the host passed to `conciv()`, and `lock(key)` names that lock; `reset(keys)` deletes some keys, `clear()` deletes every key the store holds (read from the store, not the snapshot)
- `arrangeViews(views, arrangement)` (`arrange-views.ts`): orders views pinned first (`docksPinned`), then by `docksCustomOrder` (unlisted views keep their place), and drops `docksHidden`
- `PreferencesForm` (`preferences-form.tsx`): loading, error with Retry, then one `createFormHook` form over the stored values; every change saves through a mutation, and a failed save shows on the field
- `fieldContext`, `formContext`, `useFieldContext` (`form-context.ts`): the form hook contexts
- `Group`, `SettingRow`, `ActionRow` and the shared class names (`settings-ui.tsx`): a section card with title and description, one labelled row (kit `FieldPrimitive`, hint, lock reason, error), a row with a trailing action
- `SegmentField`, `SkinField`, `SelectField`, `SwitchField` (`setting-fields.tsx`): the form's field components over kit `SegmentGroup`, `RadioGroupPrimitive` cards with a live skin preview (`shown` displays the page's `--conciv-skin` while it locks the field, without touching the stored choice), `Select` and `Switch`
- `ViewsList`, `ViewRow` (`views-list.tsx`): one row per view: show checkbox, pin, reorder by drag or Alt+ArrowUp/Down on the grip; an order equal to the natural order is stored as `{}`
- `ShortcutsList` (`shortcuts-list.tsx`): one row per command; clicking the name records keys (`createHotkeyRecorder`), Esc cancels (from the row or the conflict warning), a key already used by another command asks before moving it, and a key used by a host-locked command cannot be moved
- `readLastTab`, `writeLastTab`, `SETTINGS_TAB_ROUTES` (`last-tab.ts`): the settings tab last entered in this browser (`localStorage` key `conciv:settings-tab`), written by each tab route's `onEnter`, so tab clicks, Back/Forward and deep links all count

## Invariants

- `create-preferences.ts:write`: a value equal to its default deletes the key instead of storing it
- `preferences-schema.ts:PreferencesSchema`: every field has a default and a catch, so a malformed stored value reads as the default
- `preferences-form.tsx:createPreferencesForm`: the form follows the stored snapshot until a field is touched

## Side Effects

- `create-preferences.ts:createPreferences`: subscribes to `settings.changes` for `{scope: 'project', namespace: 'conciv'}`; writes call `settings.set` / `settings.delete`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root
