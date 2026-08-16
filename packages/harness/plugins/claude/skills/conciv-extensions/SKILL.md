---
name: conciv-extensions
description: Author conciv widget/agent extensions: theme tokens, panel surfaces (header/footer/composer/empty/status/widget), tool-call renderers, agent tools, and system-prompt text. Use when asked to customize or extend the conciv chat widget or its embedded agent.
---

# Authoring conciv extensions

Extensions are TypeScript files in `conciv/extensions/*.{ts,tsx}`, committed to the repo. One file is one extension. A bundler transform splits each file: the browser bundle drops the `.server()` half, the node engine drops the `.client()`/`.render()` half. No global registry, no manual wiring.

## The loop

1. `await external_conciv_extensions({verb: 'catalog'})` inside `execute_typescript` shows the surface (theme tokens, the six slots, client/server surfaces). Read it before writing.
2. `await external_conciv_extensions({verb: 'scaffold', kind, name})` returns a typed skeleton.
3. Write it to `conciv/extensions/<name>.tsx` (or `.ts` for the no-JSX kinds: `theme`, `tool`). `.client()` and `Component` changes hot-reload into the live widget (screenshot to confirm); new or changed `.server()` tools and prompt text need a dev-server restart.
4. `await external_conciv_extensions({verb: 'validate', source})` lints draft source against the catalog before you rely on it.

## Shape

```ts
export default defineExtension({name: 'acme'})
  .client(() => ({
    value: {
      /* browser-only state, merged into useContext */
    },
  }))
  .server(() => ({tools: [], systemPrompt: 'node-only guidance'}))
```

`defineExtension({name, Component?, systemPrompt?, theme?, tools?})`. Both `.client()` and `.server()` are optional; chain only the halves you need. The transform collapses the wrong half per build, so node code never reaches the browser and vice versa.

## Panel surfaces: one `Component`, branch on the slot

The widget renders your `Component` once per slot. Branch on `extension.useSlot()` (an accessor) and read host state/actions with `extension.useContext(select?)`. Slots: `header`, `footer`, `composer`, `empty`, `status`, `widget`.

```tsx
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({name: 'acme', Component})
export default extension

function Component() {
  const slot = extension.useSlot()
  const insert = extension.useContext((context) => context.insert)
  if (slot() === 'composer')
    return (
      <ComposerActions.Root id="acme.do" priority={10}>
        <ComposerActions.Button tooltip="Do thing" onClick={() => insert('hi')}>
          <svg
            viewBox="0 0 24 24"
            class="size-5 block"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
          </svg>
        </ComposerActions.Button>
        <ComposerActions.DropdownItem value="do" label="Do thing" onSelect={() => insert('hi')} />
      </ComposerActions.Root>
    )
  if (slot() === 'empty') return <div>Welcome! Ask me anything.</div>
  return null
}
```

`useContext()` exposes host actions (`insert`, `notify`, `setBusy`, `newSession`, `compact`, `addDivider`), host state (`harnessId`, `client`, `grab`, `currentSlot`), and whatever your `.client()` factory returned under `value`.

## Composer actions: `ComposerActions`, not a raw button

The composer toolbar is shared by the built-in actions and every extension, so it runs out of room.
Declare each action as a `ComposerActions.Root` from `@conciv/ui-kit-chat` and the composer decides
where it goes: the `Button` renders in the row while it fits, and the `DropdownItem` renders in the
shared overflow menu once it does not. Write both; the host shows exactly one at a time.

- `Root({id, priority?, disabled?})` — `id` is namespaced (`'acme.do'`), and the last root
  registered with an id wins. `priority` orders the row and the menu: higher stays inline longer,
  built-ins run 40 (grab) down to 10 (launch), so pick something below them. `disabled` is an
  accessor, and it disables both renderings at once — there is no per-child disabled prop.
- `Button({tooltip, onClick, visible?, busy?, class?, variant?})` — an icon button; `tooltip` is its
  accessible name. `visible="always"` pins it inline at any width, so spend it only on an action the
  user cannot work without. `busy` marks it in progress without disabling it.
- `DropdownItem({value, label, onSelect, children?})` — the menu row for the same action; `children`
  is an optional leading icon.
- `Inline({children})` — the escape hatch for a control that is already its own trigger (a menu, a
  status chip). It renders inline while it fits and counts toward the fit budget, but it has no menu
  form, so pair it with `DropdownItem`s when the action must survive a narrow composer.

A raw `<button>` in the composer slot is a bug: it never collapses, so it pushes the send button off
a narrow panel.

## Theme: a declarative field

```ts
export default defineExtension({name: 'acme', theme: {'pw-accent': '#2563eb'}})
```

Token names are validated by `verb: "validate"`; non-overridable tokens warn (the base theme may restyle them). Run `verb: "catalog"` for the full token list.

## Tools: renderer co-located with the definition

```tsx
const deploy = defineTool({name: 'deploy', description: '…', inputSchema: z.object({env: z.string()})})
  .server(({env}) => ({url: /* … */}))            // runs in node (MCP)
  .render((props) => <DeployCard {...props} />)    // draws its card in the browser

export default defineExtension({name: 'acme', tools: [deploy]})
```

To restyle a built-in tool you don't own, define a render-only tool with its name (no `.server`): `defineTool({name: 'Bash', …}).render(MyBashCard)`. A same-name tool wins over the built-in card.

Extra tools and prompt text can also come from `.server(() => ({tools, systemPrompt}))` when they are computed at boot.

## Solid zone

The widget is SolidJS, so `Component` and `.render()` cards are Solid components. The conciv plugin compiles `conciv/extensions/**` with Solid even inside a React host app, so write plain Solid JSX in a `.tsx` file, no pragma. For editor/typecheck correctness, give the dir its own tsconfig with `"jsx": "preserve"` + `"jsxImportSource": "solid-js"`.

A tool's `description`/`promptSnippet`/`promptGuidelines` and an extension's `systemPrompt` are appended to the agent system prompt as trusted text (you own the repo); they are not sanitized user input. Keep a top-level `node:*` import only where it is referenced inside `.server()`, or the browser build breaks.

See `packages/widget/test/fixtures/sample-extension.tsx` for a worked example.
