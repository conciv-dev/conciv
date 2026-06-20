# Mandarax Plugin / Extension System — Design

Date: 2026-06-20
Status: Approved design, pre-implementation
Branch: `worktree-plugin-system-design`

## Goal

Let a consumer of the Mandarax widget — and the embedded AI agent (Claude) working in
their repo — customize and extend the widget freely: theme, composer buttons/controls,
tool-call rendering, arbitrary UI surfaces, agent tools, and the system prompt. "Change
the base color to blue" or "add a deploy button to the composer" should be something
Claude knows exactly how to do, write as code, and see live. Each consumer ends up with
their own version of the package, version-controlled in their repo.

## Decisions (locked)

1. **Customization model: dev owns the code, file-based.** Extensions are TypeScript
   modules Claude writes/edits into the consumer's own repo (shadcn-style ownership). The
   dev-time unplugin discovers and hot-reloads them; they are committed to git and ship to
   all end-users at build/deploy. **Trusted execution — no runtime sandbox, no per-end-user
   runtime persistence layer.** "Their own version" = files in their repo.
2. **Scope: maximal.** Every surface is a hook point, with full-file ejection as the floor.
   Delivered as three reach tiers (below), implemented incrementally.
3. **Approach A** (of three considered): typed extension module + structured extension
   points + a generated catalog. Rejected: B (full swizzle-registry big-bang refactor — too
   much upfront, slow to value); C (pure source distribution, no contract — un-upgradeable
   forks, loses AI legibility).
4. **Extension shape:** TanStack `.server`/`.client` isomorphic split on the outside, Pi's
   live imperative `api` on the inside.
5. **Catalog is generated/computed from the code, never stored or hand-maintained** — it
   cannot drift by construction. No CI verification script needed.

## Reference systems

- **Pi** (badlogic `pi-mono`, the coding agent the user already runs; SDK embedded in
  `flusk/openclaw`). Source of: one typed `ExtensionAPI`, `export default function(api){}`
  factory, `api.registerX(...)` + `api.on(event,(e,ctx)=>...)` + keyed live `ctx.ui.*`
  setters (`setWidget/setHeader/setFooter/setStatus/setEditorComponent/setTheme`),
  directory discovery + `package.json` `"pi"` manifest key, jiti runtime TS loading (no
  build step), precedence layering, `/reload` hot-reload without process restart, and the
  "ask the agent to build an extension" ethos.
- **TanStack AI** (`@tanstack/ai`, already a dependency). Source of: `toolDefinition({...})`
  → `.server(execute)` / `.client(execute)` isomorphic split with `__toolSide` markers and
  type flow from a shared definition. We mirror this for the whole extension and reuse
  `toolDefinition` verbatim for tools.

## Architecture

### The extension shape

One isomorphic module with a `.client` half (runs in the widget/browser) and a `.server`
half (runs in core/harness/node). Shared declarations (tool definitions, meta) sit at the
top so types flow into both halves. Each half is a function receiving a live Pi-style `mx`.

```ts
// mandarax/extensions/acme.ts — Claude writes this, hot-reloaded, committed to git
import { defineExtension, toolDefinition } from '@mandarax/widget'
import { z } from 'zod'

const deploy = toolDefinition({
  name: 'acme_deploy',
  description: 'Deploy the current branch',
  inputSchema:  z.object({ env: z.enum(['staging','prod']) }),
  outputSchema: z.object({ url: z.string() }),
})

export default defineExtension({ id: 'acme', tools: { deploy } })
  .client(mx => {
    mx.ui.setTheme({ accent: '#2563eb', hue: 250 })
    mx.registerComposerAction({ id:'deploy', label:'Deploy', icon: Rocket,
      onClick: c => c.runTool('acme_deploy', { env:'staging' }) })
    mx.registerToolRenderer('acme_deploy', DeployCard)
    mx.ui.setWidget('deploy-status', c => <DeployStatus/>)
    mx.on('message_end', (e,c) => c.ui.setStatus('tokens', `${e.usage.total}`))
  })
  .server(mx => {
    mx.tools.deploy.server(async ({ env }) => ({ url: await runDeploy(env) }))
    mx.on('before_provider_request', (e,c) =>
      c.systemPrompt.append('You can deploy via acme_deploy.'))
  })
```

`.client`/`.server` are the **physical runtime split** and the build marker that routes each
body to the right loader. The two bodies are distinct closures, so the client bundle never
pulls in node code and the server bundle never imports Solid/JSX. The shared `toolDefinition`
is the type bridge: declared once, implemented server-side with `.server()`, rendered
client-side with `registerToolRenderer`, type-linked by name + schema.

### The `mx` surface

Most client registrations already exist internally in `createWidgetShell` /
`tool-call.tsx`; the work is promoting them to a public typed surface and adding the live
keyed setters + the missing seams. `[exists]` = present internally today, `[new]` = to build.

**Client `mx` (runs in the widget):**

- Register (additive, backed by shell registries):
  - `registerComposerAction({id,label,icon,onClick})` `[exists]` (`ComposerActionDef`)
  - `registerComposerControl({id,create})` `[exists]` (`ComposerControlDef`; the model
    selector is one)
  - `registerPanel({id,title,create})` `[exists]` (`PanelDef`)
  - `registerToolRenderer(name, Component)` `[new]` — promote the by-name `Switch` in
    `tool-call.tsx` to an open registry; `GenericCard` stays the fallback
- Live keyed UI setters (Pi-style, backed by a new reactive store the widget renders):
  - `ui.setTheme(tokens)` / `ui.setTokens({...})` `[new]` — runtime token-override seam
    (injects `:host` vars into the shadow root after base tokens)
  - `ui.setWidget(key, factory)` `[new]` — keyed UI into a named region (add/replace/remove)
  - `ui.setHeader(factory)` / `ui.setFooter(factory)` / `ui.setStatus(key, text)` `[new]`
  - `ui.setComponent(id, factory)` `[new]` — component-override (swizzle) registry
  - `ui.notify(msg)` `[exists]`
- React: `on(event, (e, ctx) => …)` `[new bus]` — client events from the TanStack stream +
  existing custom events (`MANDARAX_UI_EVENT`, `MANDARAX_USAGE_EVENT`): `message_start`,
  `message_update`, `message_end`, `tool_call`, `tool_result`, `turn_start`, `turn_end`,
  `session_start`.
- `ctx` capability bag (passed to `onClick` + handlers), reusing today's
  `ComposerActionContext`: `{ ui, meta, runTool, insert, sendMessage, setRequestMeta,
apiBase, client, notify, newSession, compact }`.

**Server `mx` (runs in core/harness):**

- `tools.<name>.server(execute)` `[new wiring]` — implement a shared `toolDefinition`'s
  execute; wired into the engine tool set at boot (`makeEngineBooter` → `@mandarax/core
start`)
- `registerTool(serverTool)` `[new wiring]` — add an agent tool
- `on(event, (e, ctx) => …)` `[new bus]` — server events from the turn pipeline:
  `before_provider_request`, `after_provider_response`, `agent_start`, `agent_end`,
  `tool_execution_start`, `tool_execution_end`, `context`, `session_*`
- `ctx` server bag: `{ systemPrompt: {append, replace, get}, model, cwd, exec, meta }`

### Three reach tiers ("pluggable in every place")

1. **Named/keyed surfaces (additive)** — composer actions/controls, panels, keyed widgets,
   header/footer/status, tool renderers. Target a named surface; discoverable from the
   catalog.
2. **Component overrides (replace)** — `ui.setComponent('ChatHeader', factory)`. Any
   component the widget renders _through the registry_ can be swapped. Coverage grows
   file-by-file; the catalog lists what's currently overridable.
3. **Ejection (own the file)** — copy the source component into the repo, edit wholesale.
   The no-limits floor; the literal "every file."

Tiers 1–2 are the stable, AI-legible surface; tier 3 is the escape hatch.

### Net-new infrastructure

Small and concentrated; everything else is promotion of existing internals:

- a reactive UI store (keyed setters: header/footer/status/widgets)
- a token-override seam
- a component-override registry
- a tool-renderer registry
- a two-sided event bus (client stream events + server turn-pipeline events)

## Discovery, loading, build split, hot-reload

One unplugin owns both sides. Mechanics adopt Pi's node model and add a thin browser step.

### Discovery

Adopt Pi's model:

- Auto-scan `mandarax/extensions/*.{ts,tsx}` (project) and a global location
  (`~/.mandarax/extensions/*`).
- Explicit paths + npm/git package extensions via a `"mandarax"` key in `package.json`
  (mirrors Pi's `"pi"` key).
- `mandarax.config.ts` may list extensions explicitly for deterministic order:
  `export default defineConfig({ extensions: [acme, billing] })`.

### Loading split

- **Server half = jiti, no bundling.** The unplugin runs in node and boots core in-process,
  so it `jiti`-loads each extension's `.server` body directly and hands it to
  `start({ options, extensions })`. Core runs them at boot: `tools.*.server()` execute fns
  join the tool set, `on(...)` handlers subscribe to the turn pipeline, `systemPrompt.append`
  augments the prompt. No strip-transform needed server-side.
- **Client half = vite virtual entry + HMR.** The widget stays a served `<script>` that
  exposes a registration global (`window.__MANDARAX__.use(ext)`). The unplugin assembles the
  consumer's `.client` halves into a vite **virtual entry** and injects it as a second
  `<script>` after the widget; on load it calls `use(ext)` per extension, driving the
  reactive UI store. HMR comes free from vite's module graph — the browser-side analog of
  Pi's `/reload`. (This is the one thing Pi never faces: Pi jiti-loads everything in one node
  process; our client half must cross into the browser, where jiti can't reach.)
- The `.client`/`.server` keys are the marker that routes each body to the right loader. A
  strip transform removes the opposite half per bundle (client build no-ops `.server(fn)` so
  its node-only imports tree-shake; server side ignores `.client`). File-convention
  (`acme.client.tsx` / `acme.server.ts` / shared `acme.tool.ts`) is the fallback if the
  transform proves fragile.

### Precedence / merge

Pi-style layering: CLI/explicit → global (`~/.mandarax`) → project (`.mandarax` /
`mandarax/extensions`) → packages; deterministic order within. Additive registrations
(actions, controls, panels, tool renderers, keyed widgets, server tools) **concatenate**;
scalar overrides (theme tokens, `setComponent`, `setHeader/Footer`) are **last-wins**.
Duplicate ids get numeric suffixes (Pi's `:1`/`:2`). The applied order is logged in dev.

### Hot-reload

- `.client` edit → vite rebuilds the virtual entry → HMR replaces it → the reactive store
  re-applies → widget re-renders live (theme/widgets/overrides update with no page reload).
- `.server` edit → re-run the extension factories and swap registrations via a reload cycle
  (Pi's `session_shutdown` → reload → `session_start{reason:"reload"}` model), re-importing
  changed TS via jiti. **No full engine restart** — Pi proves server-side hot-reload works
  by re-running factories rather than restarting.

### Trust gate

Lower priority for v1 (dev owns local files in their own repo). Relevant once npm/git
**package** extensions are supported — then a Pi-style `project_trust` prompt gates
third-party code. Deferred, not in the first slice.

## AI legibility (the heart of the feature)

What makes Claude "know exactly what to do." Pi's own answer is one typed `ExtensionAPI` +
docs + an `examples/extensions/` dir + a skill. We add a generated catalog because our
surface (theme tokens, component ids, named regions) is bigger and more visual than Pi's.

### The catalog — computed from code, never stored

The catalog is a **live projection of the runtime registries**, not an artifact. Each
surface is a runtime value that the **type, the CSS, and the catalog all derive from** — one
source, multiple projections. Drift is therefore not a representable state, and **no CI
verification script is needed**.

- **Theme tokens.** Invert today's `tokens.css` (raw CSS is the source now) so the source is
  a typed object:
  ```ts
  export const TOKENS = {
    accent: {cssVar: '--pw-accent', default: '#ff40e0', description: 'brand accent'},
    hue: {cssVar: '--pw-hue', default: '328', description: 'neutral tint hue'},
    // ...
  } as const
  ```
  From this one object we generate (a) the `:host` CSS block, (b) the `ThemeTokens` type for
  `ui.setTheme`, (c) the catalog's token list. Add a token → all three update; they cannot
  disagree.
- **Overridable components.** `overridable('ChatHeader', propsSchema)` registers into a
  module-level `COMPONENTS` map at import time. The widget renders through that same map; the
  catalog serializes it.
- **Events.** `export const CLIENT_EVENTS = [...] as const` / `SERVER_EVENTS`. `on()` is
  typed from these consts (`type Event = typeof CLIENT_EVENTS[number]`); the catalog
  serializes the same consts.
- **Tools.** Already live values (`toolDefinition(...)`); catalog reads the registered set.

`mandarax_ui catalog` computes the catalog on call by importing these real registries and
serializing them. Because the widget, the `mx` API, and the catalog all read the same
modules, "out of date" isn't a state that exists. The only discipline, enforced by
construction: a new surface is added **as a value in its registry**, with the type derived
from the value, never duplicated by hand.

(Optional: a committed `catalog.json` for docs/search can be generated from the same
registries in the build and gated with `regenerate && git diff --exit-code`. Not needed with
the live tool; skip unless a docs artifact is wanted.)

### Skill, examples, tool verbs

- **Skill `mandarax-extensions`** — conventions: the `.client/.server` shape, where files
  live, the three reach tiers, links to examples.
- **Worked examples `examples/extensions/`** — `blue-theme.ts`, `deploy-button.tsx`,
  `custom-tool-card.tsx`. LLMs copy examples more reliably than prose.
- **`mandarax_ui` agent tool gains three verbs** (Claude already has the tool in-session):
  - `catalog` → dumps the computed catalog (Claude reads the surface)
  - `scaffold <kind>` → writes a typed extension skeleton into `mandarax/extensions/`
  - `validate <file>` → typechecks + schema-checks + dry-runs, returns structured errors
- **Typed `defineExtension` + per-`register*` schema validation** → field-level errors.

The loop, e.g. "make the base color blue": `mandarax_ui catalog` → sees token `accent`
(default magenta) → `scaffold theme` → writes `.client(mx => mx.ui.setTheme({
accent:'#2563eb' }))` → HMR repaints → screenshot confirms → self-correct on any error. The
catalog grounds step 1; HMR + `validate` close the loop. That loop is _why_ it reliably knows
what to do, not just at authoring time.

## Error handling

- A throwing extension is isolated: logged, skipped, widget still mounts (the same graceful
  path as today's missing-server 404 case).
- Each keyed widget / slot / component override renders inside an error boundary, so one bad
  extension cannot crash the widget.
- `validate` surfaces schema/type errors before an extension ever loads.

## Testing strategy

House rules: real browser via Playwright `newPage()` (not `newContext()`), native
assertions (`getByRole`/`getByText`/`toBeVisible`/aria — no `querySelector`, no class
selectors, no `toBe(true)` on DOM), no jsdom, no mocks/stubs (real engine + real widget +
real drivers).

- **Extension IT:** a test extension that sets a token, adds a composer action, registers a
  tool renderer, and sets a keyed widget; assert each rendered/applied via roles/text/visible.
- **Catalog projection test:** a token in `TOKENS` ⇒ that token in the computed catalog ⇒ the
  `--pw-accent` (etc.) var present in the generated `:host` CSS. Proves single-source holds.
- **Split test:** the server bundle contains no JSX/Solid import; the client bundle contains
  no node-only import (guards the strip transform).

## First implementation slice

Proves the whole spine end-to-end before adding breadth:

- `defineExtension` + `.client`/`.server`
- `mx.ui.setTheme` token seam (the `TOKENS` inversion: TS source → CSS + type + catalog)
- one `registerComposerAction`
- unplugin discovery + jiti (server) + vite virtual entry/HMR (client) wiring
- the live `mandarax_ui catalog` verb
- one browser IT

That is "make it blue" and "add a button" working, hot-reloaded, catalog-discoverable. Then
expand: tier-2 component overrides, more events, server tools, `scaffold`/`validate`, the
skill + examples, package/global discovery + trust gate.

## Open items (deferred, not blocking the first slice)

- Trust gate for npm/git package extensions (`project_trust`).
- Whether to ship a committed `catalog.json` docs artifact (default: no).
- Global `~/.mandarax/extensions` layer (project layer first).
- `setEditorComponent`-style full-surface replacement beyond header/footer (Pi has it; add
  when a real need appears).
