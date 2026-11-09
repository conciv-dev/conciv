# settings

## Overview

The conciv preferences a user changes on the settings page: their schema, the store they live in (namespace `conciv`, `project` scope of the Devframe-contract settings store), and the TanStack Form wiring that edits them through the `@conciv/ui-kit-system` controls.

## Interface

- `PreferencesSchema`, `Preferences`, `PreferenceKeySchema`, `PREFERENCE_DEFAULTS`, `ShortcutCommand`, `SHORTCUT_DEFAULTS`, `PreferencesApi` (`preferences-schema.ts`): `colorScheme` (`page` | `light` | `dark`), `skin`, `docksHidden`, `docksCustomOrder`, `commandShortcuts` (Devframe's hub user settings shapes; a command missing from `commandShortcuts` keeps its default, an empty list turns it off)
- `createPreferences(options)` (`create-preferences.ts`): reads the stored snapshot through the live `settings.changes` query, writes through the store from `getHostApi().useScope('conciv').settings.project`; `shortcut(command)` resolves host value, then stored value, then default; `shortcutLock(command)` names why a shortcut is read-only
- `arrangeViews(views, arrangement)` (`arrange-views.ts`): orders views by `docksCustomOrder` (unlisted views keep their place) and drops `docksHidden`
- `PreferencesForm` (`preferences-form.tsx`): loading, error with Retry, then one `createFormHook` form over the stored values; every change saves through a mutation, and a failed save shows on the field
- `fieldContext`, `formContext`, `useFieldContext` (`form-context.ts`): the form hook contexts
- `SettingField` (`setting-field.tsx`): kit `FieldShell` plus the app parts: changed marker, Reset to default, locked with its reason
- `ChoiceField`, `HotkeyField`, `VisibleViewsField`, `ViewOrderField`: field components over kit `SegmentGroup`, `HotkeyRecorder`, `CheckboxGroup` and move buttons
- `SettingsSection` (`settings-section.tsx`): a titled card of fields

## Invariants

- `create-preferences.ts:write`: a value equal to its default deletes the key instead of storing it
- `preferences-schema.ts:PreferencesSchema`: every field has a default and a catch, so a malformed stored value reads as the default
- `preferences-form.tsx:createPreferencesForm`: the form follows the stored snapshot until a field is touched

## Side Effects

- `create-preferences.ts:createPreferences`: subscribes to `settings.changes` for `{scope: 'project', namespace: 'conciv'}`; writes call `settings.set` / `settings.delete`

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root
