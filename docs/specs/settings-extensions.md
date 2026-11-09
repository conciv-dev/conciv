# Extension settings, generated from a schema

Status: approved direction (Omri, 2026-11-08: "extensions must be able to add their own settings automatically").
Stacks on PR #780 (settings page). Branch `feat/settings-extensions`.

## Goal

An extension declares its user settings once, as a zod object. conciv then:

1. stores them per extension namespace in the settings store from #779 (`project` scope, namespace = extension name),
2. adds a rail/tab entry for that extension on the settings page, at `/panel/$sessionId/settings/extensions/$name`,
3. renders one control per field from the schema, through the same TanStack Form + kit controls the built-in tabs use,
4. lets the extension read the live values from its client and server code.

No extension writes UI for its settings. Extensions without `settings` get no entry.

## API

`defineExtension` gains one optional field:

```ts
defineExtension({
  name: 'terminal',
  settings: z.object({
    fontSize: z
      .number()
      .int()
      .min(10)
      .max(24)
      .default(13)
      .meta({title: 'Font size', description: 'Terminal text size.'}),
    cursor: z.enum(['block', 'bar', 'underline']).default('block').meta({title: 'Cursor'}),
    copyOnSelect: z.boolean().default(false).meta({title: 'Copy on select'}),
    shell: z.string().default('').meta({title: 'Shell', description: 'Empty uses your login shell.'}),
  }),
})
```

- `settings` is a `z.ZodObject`. Every field must have a `.default()` (enforce in the type, not at runtime).
- Field metadata uses zod v4 `.meta({title, description})` (read through `z.globalRegistry` / `schema.meta()`). No custom registry.
- Reading: the existing per-namespace `settings.project` store (`getHostApi().useScope(name).settings.project` on the client, the server scope from #779) returns raw stored values; add a typed helper on the extension builder (e.g. `useSettings()` client side) that parses stored values through the schema so the extension always sees a full, valid object (defaults filled, a malformed stored value falls back to its default via `.catch`). Server side gets the same parsed object through `ServerApi`.
- No locks (Omri, 2026-11-09, the Devframe way): `conciv({extensions})` stays server-only extension config (`configSchema`, `ServerApi.config`) and never reaches the browser; `settings` is user settings only. The two are separate; a value a project wants fixed is config, not a setting.
- `defineExtension` also gains an optional `icon?: Component<{class?: string}>` (same shape as `ExtensionView.icon`), used for the extension's settings tab.

## Control mapping (generated page)

| zod type                         | control (existing app field components in `apps/conciv/src/settings/setting-fields.tsx`)                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `z.boolean()`                    | `SwitchField`                                                                                                                                                |
| `z.enum([...])` with ≤ 3 options | `SegmentField`                                                                                                                                               |
| `z.enum([...])` with > 3 options | `SelectField`                                                                                                                                                |
| `z.number()`                     | kit number input (add a `NumberField` app field over the kit's Ark `NumberInput` if the kit has one; if the kit lacks it, STOP and report, do not hand-roll) |
| `z.string()`                     | text input over kit `FieldPrimitive` + kit input                                                                                                             |
| anything else                    | not rendered; listed in a dev `console.warn` once per extension                                                                                              |

Label = `meta.title` (fallback: the key, humanised), hint = `meta.description`. Group the fields in one `Group` card titled with the extension name, using `Group`/`SettingRow` from `settings-ui.tsx`. Values save on change like the built-in tabs (`PreferencesForm` pattern: one `createFormHook` form, a failed save shows on the field).

## Routes & layout

- New file route `panel.$sessionId_.settings.extensions.$name.tsx`. Unknown `$name` (no such extension, or no `settings`) redirects to `/panel/$sessionId/settings/general` in `beforeLoad`, never throws.
- The settings layout (`panel.$sessionId_.settings.tsx`) lists one tab per extension with settings, after Shortcuts and before the spacer/Advanced, with the extension's `icon` (fallback `Puzzle` from lucide). Tabs stay route-driven (`useMatchRoute`), keep `data-glide` so the top-tab / rail transition still animates, and the last-tab memory (`last-tab.ts`) must accept extension tabs (store the extension name; an extension that is gone falls back to `general`).
- Advanced gains a "Reset extension settings" row next to Views/Shortcuts that clears every extension namespace's project settings (reuse the existing reset mutation shape).

## Constraints (all mandatory, from AGENTS.md and Omri's standing rules)

- Work only in your worktree. Commit locally. **Do NOT push. Do NOT open a PR.**
- Functions, no classes, no IIFEs, zero comments, no `any`/`as`/non-null `!`, no abbreviations in names, kebab-case file names, no barrel files.
- Solid: no raw `createSignal`/`createEffect`; use `createMemo`, solid-query, TanStack Form, `@solid-primitives/*`.
- Styling: UnoCSS classes from preset tokens only. No `.css` files, no arbitrary breakpoints (`@[360px]`), container variants `@xs/@sm/@md/@lg` only. Match the existing settings page look exactly (cards, rows, controls); do not invent a new style.
- Ark only through `@conciv/ui-kit-system`. The kit only gets generic Ark controls it lacks; settings-specific components live in `apps/conciv/src/settings/`.
- Use library features before writing code (zod v4 meta/registry, TanStack Form field API, router `beforeLoad` redirect). Never hand-roll a primitive a library already has.
- Tests: no new test files. Extend the existing `describe('settings page')` journey in `apps/conciv/test/conciv.browser.test.tsx` with an extension that declares `settings` (one boolean, one enum, one number, one string): open its tab, change each control like a user (pointer clicks, typing), see the value reach the extension (render it from the extension's `Surface`), reload, see it persist. Extension package unit coverage goes into the existing node test file of `packages/extension`. Run only the test files you touched, never full suites or turbo gates.
- Headless browsers only.
- Before finishing: `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` must pass; add a changeset (`'@conciv/extension': patch` and `'@conciv/embed': patch`); update `packages/extension/src/README.md` and `apps/conciv/src/settings/README.md`.

## Out of scope (do not build; report if you think they are needed)

- Extension command shortcuts on the Shortcuts tab (`ExtensionCommand` has no key binding today; that is an API decision for Omri).
- Global-scope (per-user) extension settings UI.
- Nested objects / arrays in `settings`.
