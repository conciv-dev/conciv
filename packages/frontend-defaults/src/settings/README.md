# frontend-defaults/src/settings

## Overview

The conciv preferences a user changes on the settings page: their schema, the two stores they live in (namespace `conciv`, the `project` and `global` scopes of the Devframe-contract settings store, applied project over global over defaults), and the TanStack Form wiring that edits them through the `@conciv/ui-kit-system` controls.

## Interface

- `preferences-schema.ts`: the preferences schema (`colorScheme`, `skin`, `launcher`, `openOnLoad`, `closeOnOutsideClick`, `commandShortcuts`, Devframe's hub user settings shapes; a command missing from `commandShortcuts` keeps its default, an empty list turns it off).
- `create-preferences.ts`: both scopes of the `conciv` namespace as live `settings.changes` queries, applied with `mergeSettings(project, global)` of `@conciv/client`, and the writes to the selected scope.
- `preferences-form.tsx`, `form-context.ts`, `setting-fields.tsx`, `settings-ui.tsx`, `setting-note.ts`, `shortcuts-list.tsx`: the TanStack Form form, one per scope, and its fields over the kit controls; every change saves to the form's scope, and a failed save shows on the field.
- `settings-search-schemas.ts`, `scope-names.ts`, `last-tab.ts`: the layout's `scope` search param (`project` by default, stripped from the URL, or `global`), each scope as a phrase, and the last tab entered (`localStorage` key `conciv:settings-tab`).

## Invariants

- `create-preferences.ts` (the write to a scope): a value equal to what applies without the key in the edited file (project: global over defaults; global: the default) deletes the key instead of storing it; `commandShortcuts` is written per entry: only entries that differ from the lower layer (or the default) are kept, so editing one command never freezes the others
- `preferences-schema.ts:PreferencesSchema`: every field has a default and a catch, so a malformed stored value reads as the default
- `preferences-form.tsx:createPreferencesForm`: the form follows the stored snapshot until a field is touched
- `last-tab.ts:readLastTab`: an unreadable value (also a tab that no longer exists) reads as `general`

## Side Effects

- `create-preferences.ts:createSettingsLayers`: subscribes to `settings.changes` for `{scope: 'project', namespace}` and `{scope: 'global', namespace}`; writes call `settings.set` / `settings.delete` on the selected scope

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@internal/frontend-defaults` and `pnpm lint` from the repo root
