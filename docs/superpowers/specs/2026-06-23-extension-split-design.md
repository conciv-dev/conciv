# Extension Split — Bundler-Driven, Import-Based, No Global Registry

Date: 2026-06-23
Status: Approved (design, proven by spike)
Supersedes the extension-delivery parts of `2026-06-23-extension-api-rewrite-design.md` (the `__CONCIV__` queue / virtual-module path).

## Goal

One authored file per extension. Both consumers — the node engine and the browser widget — get extensions through **plain `import`s**. A bundler transform gives each side the right half: the browser bundle has the `.server()` half stripped; node runs the full module. No global registry, no install queue, no self-mounting widget.

## Mechanism (proven by spike, follows TanStack's tested compiler)

Two distinct load paths — no runtime environment detection needed, because the client and server never share a build:

- **Client (the widget bundle):** the app's bundler runs our `unplugin` `transform`, which **collapses `.server(...)`** out of every extension/tool chain.
- **Server (the engine):** the jiti loader applies the same transform with the opposite direction, **collapsing `.client(...)` / `.render(...)`**, so the backend never imports client/card/Solid code.

The transform itself follows TanStack's proven pipeline (verified against their `start-plugin-core` source): parse → record referenced identifiers → collapse the wrong-side calls (`path.replaceWith(callee.object)`, their `handleCreateIsomorphicFn` idea) → run **`babel-dead-code-elimination`** to drop the now-orphaned imports/vars → generate.

```ts
import {parseAst, findReferencedIdentifiers, deadCodeElimination, generateFromAst} from 'babel-dead-code-elimination' // + @babel helpers
const STRIP = {browser: new Set(['server']), node: new Set(['client', 'render'])}

export function splitExtension(code, id, env /* 'browser' | 'node' */) {
  if (!code.includes('defineExtension')) return null // content gate — not a filename
  const ast = parseAst({code, filename: id})
  const referenced = findReferencedIdentifiers(ast) // BEFORE the collapse
  babelTraverse(ast, {
    // collapse the wrong-side calls
    CallExpression(path) {
      const c = path.node.callee
      if (isMemberExpression(c) && isIdentifier(c.property) && STRIP[env].has(c.property.name))
        path.replaceWith(c.object)
    },
  })
  deadCodeElimination(ast, referenced) // drop orphaned imports — REQUIRED
  return generateFromAst(ast)
}
```

`unplugin` yields `.vite() / .rollup() / .webpack() / .rspack() / .esbuild() / .farm()` from one factory, so the client path is bundler-agnostic (the rspack concern).

**Spike result (then deleted):** bidirectional collapse works — browser drops `.server(...)`, node drops `.client(...)`/`.render(...)`; `__server`/`__client` survive on the right side; the vite browser bundle is clean. **Key finding:** the collapse alone leaves the orphaned `node:fs` import — the bundler does **not** tree-shake it — so `babel-dead-code-elimination` (not bundler tree-shaking) is what removes orphans. This is exactly why TanStack runs it, and why our current `stripServerHalf` hand-rolls import removal (which we replace with the package).

## Authoring

```ts
// any filename — the marker is `defineExtension`, not the name
export default defineExtension({name: 'x', tools: [...]})
  .client(() => ({ /* browser only */ }))
  .server(() => ({ /* node only: routes, getRunner, ... */ }))
```

## Internal shape — follows TanStack's `createServerFn` (Pattern 2)

An extension/tool is an aggregate object that lives in a list, so it follows TanStack's `createServerFn` shape, not `createIsomorphicFn` (which collapses to a bare function and has no object). The builder records each chained half onto the object under a **`__`-prefixed** property, signalling "engine/widget-internal — never called by extension authors" (the same convention as TanStack's `__executeServer`):

```ts
ext.__client // set by .client(fn) — read by the widget at mount
ext.__server // set by .server(fn) — read by the engine at boot
tool.__execute // set by .server(fn)
tool.__render // set by .render(Card)
```

The transform **collapses** the wrong-side call per environment (Pattern 1's idea, adapted): in the browser build it removes the `.server(...)` call from the chain (so `ext.__server` is simply never set + node imports drop); in the node build it removes `.client(...)` / `.render(...)`. Cleaner than nulling the argument — the object survives, the wrong-side half is gone entirely.

## The two gather points

Each just builds `[...builtinExtensions, ...userExtensions]`.

**Server — `core/src/engine.ts` via `plugin/src/core/boot.ts` (+ `vite.ts`).** Node runs full modules; no strip needed.

```ts
import {builtinExtensions} from '@conciv/extensions-builtin'
const userExtensions = await discoverUserExtensions(root) // jiti-glob of conciv/extensions/*
start({extensions: [...builtinExtensions, ...userExtensions]}) // engine drains .server() → routes + MCP tools
```

**Client — `plugin` client entry → `widget/src/mount.tsx`.** The transform already stripped `.server()` before this is bundled.

```ts
import {builtinExtensions} from '@conciv/extensions-builtin'
import {mountWidget} from '@conciv/widget'
const userExtensions = Object.values(import.meta.glob('/conciv/extensions/*.{ts,tsx}', {eager: true}))
  .map((m) => m.default)
  .filter(Boolean)
mountWidget([...builtinExtensions, ...userExtensions])
```

```ts
// widget mount takes the list as an ARGUMENT (no global, no self-mount)
export function mountWidget(extensions: ExtensionBuilder[]): void {
  /* slots + tool cards from the array */
}
```

## What is deleted (the "ugly stuff")

- `widget/src/extension-runtime.ts` — `installExtensionGlobal` (whole file).
- `widget/src/conciv-global.ts` — the `use` / `queue` extension keys (the file survives only for react-grab's own `registerPlugin` keys, or is renamed grab-owned).
- `extensionsModuleSource()`'s queue dance (`plugin/src/core/extensions.ts`) — replaced by the import + `mountWidget([...])` entry above.
- `mount.tsx` self-invocation + global read — replaced by exported `mountWidget(extensions)`.
- `chat-panel.tsx` `extensions: () => ExtensionBuilder[]` accessor → plain `ExtensionBuilder[]` (no runtime `use()`, so no reactivity; HMR remounts).

## Implementation wiring

- **Client:** the `unplugin` `transform` calls `splitExtension(code, id, 'browser')`. One factory → every bundler adapter.
- **Server:** the engine's jiti loader (`plugin/src/core/extensions.ts`, `loadServerExtensions`) passes `splitExtension(code, id, 'node')` as jiti's `transform`, so the backend's extension modules drop `.client()`/`.render()` and their Solid/card imports.
- **Replace** the current one-directional, hand-rolled `plugin/src/core/strip-server.ts` (`stripServerHalf`) with `splitExtension` (bidirectional, DCE-based).
- **New dependency:** `babel-dead-code-elimination` on `@conciv/plugin` (it ships `findReferencedIdentifiers` + `deadCodeElimination`). This needs an install — confirm before adding, per repo policy.

## Open points (not blocking)

1. **Built-ins live in a package → bundlers skip `node_modules`.** The transform must `include` `@conciv/extensions-builtin` (keeps single-file authoring) — vs pre-shipping it split. Decision: `include` it.
2. **Cross-bundler user discovery.** `import.meta.glob` is vite-only; webpack/rspack/esbuild need a generated module. `discoverUserExtensions` (server, jiti) is already bundler-agnostic.
3. **The collapse matches any `.server(`/`.client(`/`.render(` member call** within a file that imports the contract (the `defineExtension` content gate scopes it). Fine in practice; tighten to verified `defineExtension`/`defineTool` chains only if a real collision appears.

## Not in this spec

The test-runner migration and the API gaps (config, tool context, routes, dispose) are separate — this spec is only the delivery/split mechanism. Build that on top once this lands.
