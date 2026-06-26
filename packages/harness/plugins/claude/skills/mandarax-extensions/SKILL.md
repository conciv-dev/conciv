---
name: mandarax-extensions
description: Author mandarax widget/agent extensions — theme tokens, panel surfaces (header/footer/composer/empty/status/widget), tool-call renderers, agent tools, and system-prompt text. Use when asked to customize or extend the mandarax chat widget or its embedded agent.
---

# Authoring mandarax extensions

Extensions are TypeScript files in `mandarax/extensions/*.{ts,tsx}`, committed to the repo. One file is one extension. A bundler transform splits each file: the browser bundle drops the `.server()` half, the node engine drops the `.client()`/`.render()` half. No global registry, no manual wiring.

## The loop

1. `mandarax_extensions` with `verb: "catalog"` — see the surface (theme tokens, the six slots, client/server surfaces). Read it before writing.
2. `mandarax_extensions` with `verb: "scaffold", kind, name` — get a typed skeleton.
3. Write it to `mandarax/extensions/<name>.tsx` (or `.ts` for the no-JSX kinds: `theme`, `tool`). `.client()` and `Component` changes hot-reload into the live widget (screenshot to confirm); new or changed `.server()` tools and prompt text need a dev-server restart.
4. `mandarax_extensions` with `verb: "validate", source` — lint against the catalog before relying on it.

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

## Panel surfaces — one `Component`, branch on the slot

The widget renders your `Component` once per slot. Branch on `extension.useSlot()` (an accessor) and read host state/actions with `extension.useContext(select?)`. Slots: `header`, `footer`, `composer`, `empty`, `status`, `widget`.

```tsx
const extension = defineExtension({name: 'acme', Component})
export default extension

function Component() {
  const slot = extension.useSlot()
  const insert = extension.useContext((context) => context.insert)
  if (slot() === 'composer')
    return (
      <button type="button" onClick={() => insert('hi')}>
        Do thing
      </button>
    )
  if (slot() === 'empty') return <div>Welcome — ask me anything.</div>
  return null
}
```

`useContext()` exposes host actions (`insert`, `notify`, `setBusy`, `newSession`, `compact`, `addDivider`), host state (`harnessId`, `client`, `grab`, `currentSlot`), and whatever your `.client()` factory returned under `value`.

## Theme — a declarative field

```ts
export default defineExtension({name: 'acme', theme: {'pw-accent': '#2563eb'}})
```

Token names are validated by `verb: "validate"`; non-overridable tokens warn (the base theme may restyle them). Run `verb: "catalog"` for the full token list.

## Tools — renderer co-located with the definition

```tsx
const deploy = defineTool({name: 'deploy', description: '…', inputSchema: z.object({env: z.string()})})
  .server(({env}) => ({url: /* … */}))            // runs in node (MCP)
  .render((props) => <DeployCard {...props} />)    // draws its card in the browser

export default defineExtension({name: 'acme', tools: [deploy]})
```

To restyle a built-in tool you don't own, define a render-only tool with its name (no `.server`): `defineTool({name: 'Bash', …}).render(MyBashCard)` — a same-name tool wins over the built-in card.

Extra tools and prompt text can also come from `.server(() => ({tools, systemPrompt}))` when they are computed at boot.

## Solid zone

The widget is SolidJS, so `Component` and `.render()` cards are Solid components. The mandarax plugin compiles `mandarax/extensions/**` with Solid even inside a React host app — write plain Solid JSX in a `.tsx` file, no pragma. For editor/typecheck correctness, give the dir its own tsconfig with `"jsx": "preserve"` + `"jsxImportSource": "solid-js"`.

A tool's `description`/`promptSnippet`/`promptGuidelines` and an extension's `systemPrompt` are appended to the agent system prompt as trusted text (you own the repo) — they are not sanitized user input. Keep a top-level `node:*` import only where it is referenced inside `.server()`, or the browser build breaks.

See `packages/widget/test/fixtures/sample-extension.tsx` for a worked example.
