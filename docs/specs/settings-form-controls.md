# Ark form controls missing from @conciv/ui-kit-system

Status: rework of PR #778 (Omri, 2026-11-09).

## The rule

`@conciv/ui-kit-system` is the design system. It gets the generic, Ark-backed controls it is missing, and
nothing else. Anything specific to a feature (settings form wiring, settings vocabulary, settings states) lives
in the app or extension that uses it. The settings page will be built in `apps/conciv` using these kit
controls, as nested routes with tabs; that is the next PR.

## Why

conciv is getting a settings page, and extensions will add their own settings. The page needs input controls
the kit does not have yet: number input, tags input, color picker, password input, checkbox, radio cards,
a styled combobox, a shortcut recorder and a confirm dialog. Any feature could use them unchanged, so they
belong in the kit.

Visual reference: `docs/specs/settings-controls-mockup.html` (the look of each control; ignore its settings
copy). `docs/specs/settings-page-variant-a.html` and `-b.html` are page layouts for the next app PR.

## Scope of the rework (commits on PR #778)

### Remove from the kit

- `settings-form.tsx`, `settings-form-contexts.ts`, `settings-fields.tsx`, `settings-form.stories.tsx`, and the
  `useSettingsForm` export.
- The `@tanstack/solid-form` dependency (and the vite external for it).
- From the field wrapper: the changed marker, "Reset to default" and the locked-with-reason state. Those are
  settings concepts and come back in the app.

### Keep in the kit, made generic

- The field wrapper (`FieldShell`, on Ark `Field` / `Fieldset`): label, description, error, `row` / `stack`
  layout, disabled, read-only, required. Nothing else.
- `NumberInput`, `TagsInput`, `ColorPicker`, `PasswordInput`, `Checkbox` / `CheckboxGroup`, `RadioCards`,
  `ComboboxSelect`, `HotkeyRecorder`, `ConfirmDialog`, and the `TextField` / `Select` extensions (invalid
  state, addons, end action). Each control takes plain props (`value`, `onValueChange`, `disabled`,
  `readOnly`, `invalid`, ...); no form library inside.
- Remove props or code paths that only existed for the settings wiring. Keep whatever a generic consumer of
  the Ark primitive would expect.

### Stories

- Every control keeps a states story and a keyboard story, with neutral copy (no settings, no "Set in
  vite.config.ts", no product feature names). States: default, invalid with error, disabled, read-only.
- Stories hold state with `createStore`, not a form library.
- `play` functions stay the interaction tests: pointer clicks, typing key by key, Tab and arrow keys, focus
  asserts. They must fail if the behaviour breaks.

### Changeset

Rewrite `.changeset/settings-form-controls.md` to describe new generic controls (patch).

## Rules (all apply)

- Functions, not classes. No IIFEs. Zero comments in TS/TSX. No `any`, no `as`, no `@ts-ignore`, no `!`. No em
  dashes in code.
- Solid: no raw `createSignal` / `createEffect`.
- Styling: UnoCSS classes from existing `--chat-*` / kit tokens, `focus-ring` utility, kit motion tokens.
- Tests: no new test files; `test/ui-kit-system.browser.test.tsx` must not grow. No mocks, no CSS/DOM
  implementation assertions, no test ids. Headless browsers only. One Storybook, one test run at a time.
- `pnpm exec fallow audit --changed-since main --format json --quiet` must report nothing INTRODUCED.
- Git: commit on branch `feat/settings-form-controls` in its worktree. Do not push. Do not open a PR.

## Out of scope

The settings page in `apps/conciv` (nested routes, one per tab), the settings form wiring with TanStack Form
(app), settings storage, the extension `settings` API.
