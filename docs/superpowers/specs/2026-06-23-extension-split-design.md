# Extension Split — Bundler-Driven, Import-Based, No Global Registry

Date: 2026-06-23
Status: Approved (design, proven by spike)
Supersedes the extension-delivery parts of `2026-06-23-extension-api-rewrite-design.md` (the `__MANDARAX__` queue / virtual-module path).

## Goal

One authored file per extension. Both consumers — the node engine and the browser widget — get extensions through **plain `import`s**. A bundler transform gives each side the right half: the browser bundle has the `.server()` half stripped; node runs the full module. No global registry, no install queue, no self-mounting widget.

## Mechanism (proven)

A single `unplugin` `transform` hook. Cheap content gate, then the existing `stripServerHalf` (babel) when building for the browser:

```ts
createUnplugin(() => ({
  name: 'mandarax-split-extensions',
  transform(code, id) {
    if (!buildingForBrowser) return null // node/backend keeps the full module
    if (!code.includes('defineExtension')) return null // the marker — NOT a filename convention
    return stripServerHalf(code, id) // drop .server() body + now-unused node imports
  },
}))
```

`unplugin` yields `.vite() / .rollup() / .webpack() / .rspack() / .esbuild() / .farm()` from this one factory, so it is bundler-agnostic (the rspack concern). The spike (`packages/plugin/spike-split/`) proved: server body + `node:fs` stripped from a real vite browser build; a non-extension file with an unrelated `.server()` call is untouched; node import runs the full `.server()`.

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
import {builtinExtensions} from '@mandarax/extensions-builtin'
const userExtensions = await discoverUserExtensions(root) // jiti-glob of mandarax/extensions/*
start({extensions: [...builtinExtensions, ...userExtensions]}) // engine drains .server() → routes + MCP tools
```

**Client — `plugin` client entry → `widget/src/mount.tsx`.** The transform already stripped `.server()` before this is bundled.

```ts
import {builtinExtensions} from '@mandarax/extensions-builtin'
import {mountWidget} from '@mandarax/widget'
const userExtensions = Object.values(import.meta.glob('/mandarax/extensions/*.{ts,tsx}', {eager: true}))
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
- `widget/src/mandarax-global.ts` — the `use` / `queue` extension keys (the file survives only for react-grab's own `registerPlugin` keys, or is renamed grab-owned).
- `extensionsModuleSource()`'s queue dance (`plugin/src/core/extensions.ts`) — replaced by the import + `mountWidget([...])` entry above.
- `mount.tsx` self-invocation + global read — replaced by exported `mountWidget(extensions)`.
- `chat-panel.tsx` `extensions: () => ExtensionBuilder[]` accessor → plain `ExtensionBuilder[]` (no runtime `use()`, so no reactivity; HMR remounts).

## Open points (not blocking)

1. **Built-ins live in a package → bundlers skip `node_modules`.** The transform must `include` `@mandarax/extensions-builtin` (keeps single-file authoring) — vs pre-shipping it split. Decision: `include` it.
2. **Cross-bundler user discovery.** `import.meta.glob` is vite-only; webpack/rspack/esbuild need a generated module. `discoverUserExtensions` (server, jiti) is already bundler-agnostic.
3. **`stripServerHalf` matches any `.server(` member call.** Fine for extension files; tighten to `defineExtension`/`defineTool` chains only if a real collision appears.

## Not in this spec

The test-runner migration and the API gaps (config, tool context, routes, dispose) are separate — this spec is only the delivery/split mechanism. Build that on top once this lands.
