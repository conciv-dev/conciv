# Settings form controls in @conciv/ui-kit-system

Status: approved direction (Omri, 2026-11-08). First PR of the settings lane.

## Why

conciv is getting a settings page. Extensions will declare their own settings with a zod schema and the page
renders a control for each field, so the kit needs a complete, accessible set of form controls that look
right in the 480px panel and work the same everywhere. This PR builds those controls and wires them to
TanStack Form. The settings page, its routes and the settings storage come in later PRs.

Visual reference (open in a browser):

- `docs/specs/settings-controls-mockup.html`: every control, every state. This is the target look.
- `docs/specs/settings-page-variant-a.html`, `docs/specs/settings-page-variant-b.html`: the two page layouts
  under consideration, so you can see the controls in context. Do not build the pages.

The mockup's colors are approximations; the real controls use the kit's existing tokens and skins.

## Scope

All in `packages/ui-kit-system`.

### 1. Field shell (new)

Built on Ark `Field` (and `Fieldset` for groups). One shell every control sits in:

- label, description under it, error under that (`Field.ErrorText`, announced), all linked by Ark so the
  control gets `aria-describedby` and `aria-invalid`;
- two layouts: `row` (label block left, control right, for switches, selects, short numbers) and `stack`
  (control under the label, for cards, tags, text areas, the recorder);
- a changed marker plus a "Reset to default" action, shown when the consumer says the value differs from its
  default;
- a locked state: control read-only, value visible, and a reason line ("Set in vite.config.ts");
- disabled state with the reason in the description.

### 2. Controls

Existing components are restyled or extended to sit in the shell; new ones are built on the Ark primitive
named. Read each component's anatomy and examples with the Ark UI MCP (`mcp__ark-ui__*`) before building.

| Setting kind              | Component                                   | Ark primitive        | Notes                                                                                                                                                            |
| ------------------------- | ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boolean                   | `Switch` (exists)                           | switch               | row layout                                                                                                                                                       |
| 2 to 4 choices            | `SegmentGroup` (exists)                     | segment-group        | optional icon per item, sliding indicator stays                                                                                                                  |
| choices with explanations | `RadioCards` (new)                          | radio-group          | title + description per option, arrow keys                                                                                                                       |
| long list                 | `Select` (exists)                           | select               | add invalid styling                                                                                                                                              |
| searchable list           | `Combobox` (exists, unstyled today)         | combobox             | style it; filter as you type                                                                                                                                     |
| number in a range         | `Slider` (exists) paired with `NumberInput` | slider, number-input | value always visible, optional ticks                                                                                                                             |
| open-ended number         | `NumberInput` (new)                         | number-input         | steppers, unit suffix, arrow/Page keys                                                                                                                           |
| text                      | `TextField` (exists)                        | field                | add invalid, prefix/suffix addons, end buttons                                                                                                                   |
| URL / path                | `TextField` with addons                     | field                | prefix text or icon, end action slot                                                                                                                             |
| long text                 | `TextArea` (exists)                         | field                | optional character counter                                                                                                                                       |
| secret                    | `PasswordInput` (new)                       | password-input       | reveal toggle, optional copy                                                                                                                                     |
| list of text              | `TagsInput` (new)                           | tags-input           | Enter/comma add, Backspace remove                                                                                                                                |
| several of a set          | `Checkbox`, `CheckboxGroup` (new)           | checkbox             |                                                                                                                                                                  |
| color                     | `ColorPicker` (new)                         | color-picker         | swatch, hex input, presets, picker in a popover                                                                                                                  |
| keyboard shortcut         | `HotkeyRecorder` (new)                      | none                 | `createHotkeyRecorder` from `@tanstack/solid-hotkeys`; shows keys as kbd chips, record state, modifier toggles, conflict warning slot, Esc cancels, clear button |
| destructive action        | `ConfirmDialog` (new)                       | dialog               | built on the kit `Dialog`; focus starts on Cancel                                                                                                                |

### 3. TanStack Form wiring

Add `@tanstack/solid-form` to the kit (TanStack packages are pre-approved). Export a form hook made with
`createFormHookContexts` + `createFormHook` whose `fieldComponents` are one field component per row of the
table above (`TextField`, `NumberField`, `SliderField`, `SwitchField`, `SegmentField`, `RadioCardsField`,
`SelectField`, `ComboboxField`, `CheckboxGroupField`, `TagsField`, `PasswordField`, `ColorField`,
`HotkeyField`, `TextAreaField`; name them consistently). Each field component:

- reads `useFieldContext`, wires value, change and blur;
- shows the first validation error in the shell's error slot and sets the invalid state;
- takes `label`, `description`, `locked`, `changed` / `onReset`, `disabled` like the shell.

The kit stays validator-agnostic: field components show whatever errors TanStack Form reports, so a consumer can pass a zod
schema (Standard Schema) or plain validator functions. The stories use TanStack Form's function validators, so the kit
carries no zod dependency; the zod-to-control mapping arrives with the extension settings API.
There is no save button: the kit only reports changes. Choices, toggles and sliders commit on change; text
and numbers commit on blur or Enter (expose this so a consumer can autosave).

### 4. Storybook

Every control gets a story file (or its existing file is extended) under `ui-kit-system/<Component>`,
showing: default, focused, changed with reset, invalid with error, locked, disabled. Plus one composite story,
`ui-kit-system/Settings form`: one field of every kind, each with a validator, rendered through the form hook in the
row/stack layouts at 480px wide, with a visible log of committed values, so you can see validation and commits
work.

Stories must look good in both skins and in light and dark. Run the storybook app headless
(`apps/storybook`, `storybook dev`), open every new or changed story with Playwright (headless), screenshot
each state, and look at the screenshots before you finish. Report the screenshot paths.

Story `play` functions are the interaction tests: drive each control the way a user does (pointer clicks,
typing key by key, Tab and arrow keys) and assert the result and where focus lands, written so they fail if
the behaviour breaks.

## Rules (all apply, no exceptions)

- Functions, not classes. No IIFEs. Zero comments in TS/TSX. No `any`, no `as` casts, no `@ts-ignore`,
  no non-null `!`. No em dashes in code.
- Solid: no raw `createSignal` / `createEffect` in new component code; use TanStack Form state, Ark's own
  state, `createMemo`, or `@solid-primitives/*`. Stories hold their state in the form hook, not signals.
- Styling: UnoCSS classes in the component files, the way `text-field.tsx` does it, deriving every value from
  existing `--chat-*` / kit tokens. No new raw colors, no new CSS files, nothing in `styles.css`. px only for
  hairline borders. Focus rings use the existing `focus-ring` utility. Motion uses the kit's motion tokens and
  turns off under reduced motion.
- Accessibility: every control has an accessible name and description through Ark `Field`; keyboard follows
  Ark; check contrast with the existing `test/wcag.ts` helper.
- Tests: one browser and one node test file per package. `test/ui-kit-system.browser.test.tsx` is already at
  1071 lines and must not grow: put interaction coverage in story `play` functions, and if something must go in
  the browser test file, delete a duplicate to make room. No mocks, no stubs, no CSS or DOM implementation
  assertions, no test ids. Run only the test files and stories you touch. Headless browsers only.
- Never load the machine: one Storybook, one test run at a time.
- Add a changeset (`@conciv/ui-kit-system` is published).
- Before finishing: `pnpm exec fallow audit --changed-since main --format json`, fix anything INTRODUCED.
- Git: work only in a dedicated worktree on branch
  `feat/settings-form-controls`. Commit locally, in small commits. Do NOT push. Do NOT open a PR.

## Out of scope

The settings page and its routes, settings storage on the engine, the zod-to-control mapping for extension
schemas, the extension `settings` API. Those are the next PRs.
