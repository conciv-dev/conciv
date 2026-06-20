---
name: mandarax-extensions
description: Author mandarax widget/agent extensions — theme, composer buttons, tool-call renderers, UI regions, component overrides, agent tools, and system-prompt text. Use when asked to customize or extend the mandarax chat widget or its embedded agent.
---

# Authoring mandarax extensions

Extensions are TypeScript files in `mandarax/extensions/*.{ts,tsx}`, committed to the repo. Drop a
file and it hot-reloads into the live widget (client) and the agent engine (server). No manual wiring.

## The loop

1. `mandarax_extensions` with `verb: "catalog"` — see the surface (theme tokens, overridable
   components, client/server APIs). Read it before writing.
2. `mandarax_extensions` with `verb: "scaffold", kind, id` — get a typed skeleton.
3. Edit it into `mandarax/extensions/<id>.ts`. Client (`.client`) changes hot-reload into the live
   widget (screenshot to confirm); new or changed server (`.server`) tools + prompt text need a
   dev-server restart.
4. `mandarax_extensions` with `verb: "validate", source` — lint against the catalog before relying on it.

## Shape

```ts
export default defineExtension({id: 'acme'})
  .client((mx) => {
    /* runs in the browser widget */
  })
  .server((mx) => {
    /* runs in the agent engine (node) */
  })
```

## Solid zone

The widget is SolidJS, so renderers and `ui.set*` factories are Solid components. The mandarax plugin
compiles `mandarax/extensions/**` with Solid even inside a React host app — write plain Solid JSX in a
`.tsx` file, no pragma. For editor/typecheck correctness, give the dir its own tsconfig with
`"jsx": "preserve"` + `"jsxImportSource": "solid-js"` (see
`apps/examples/tanstack-start/mandarax/extensions/tsconfig.json`).

## Tools (renderer co-located with the definition)

```ts
const deploy = defineTool({name: 'deploy', description: '…', inputSchema: z.object({env: z.string()})})
  .server(({env}) => ({url: …}))          // runs in node (MCP)
  .render((props) => <DeployCard {...props} />)  // draws its card in the browser

export default defineExtension({id: 'acme', tools: [deploy]})  // both halves auto-wired
```

To restyle a built-in tool you don't own, define a render-only tool with its name (no `.server`):
`defineTool({name: 'Bash', …}).render(MyBashCard)` — a same-name tool wins over the built-in card.

## Reach tiers

1. Additive surfaces: `registerComposerAction`, declared `tools` (renderer via `.render`), `ui.setWidget/setHeader/setFooter/setStatus`.
2. Overrides: `ui.setTheme` (token-level), named setters like `ui.setEmptyState(factory)` (one per surface).
3. Ejection: copy the source component into your repo and edit wholesale.

Client `mx`: `ui.setTheme`, `ui.setWidget/setHeader/setFooter/setStatus`, `ui.setEmptyState`,
`registerComposerAction`. Tool cards are self-describing — co-locate via `defineTool(...).render(Component)`.
Server `mx`: `registerTool(defineTool({…}).server(…))`, `systemPrompt.append(text)`.

A tool's `description`/`promptSnippet`/`promptGuidelines` are appended to the agent system prompt as
trusted text (you own the repo) — they are not sanitized user input.

See `apps/examples/tanstack-start/mandarax/extensions/` for worked examples.
