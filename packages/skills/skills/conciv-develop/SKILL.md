---
name: conciv-develop
description: Use when building a conciv plugin in your own app or as a package, a folder or file under conciv/plugins/ (or a package listed in the conciv() `plugins` option) that adds agent tools, skills, prompt rules or RPC methods to the engine with Plugin.define from @conciv/plugin/effect, and panels, slots, composer pills, commands or settings to the widget with @conciv/plugin/experimental. Covers the engine part, the RPC contract (Rpc.define), the browser part and its vite build, approvals, and testing with @conciv/plugin-testkit. This is the consumer-facing skill, for an app that depends on @conciv/plugin, not conciv's own source.
metadata:
  package: '@conciv/skills'
---

# Building a conciv plugin

## Who this is for

You are a developer (or an agent working in a developer's app) adding a plugin to teach the conciv
agent a new capability, or publishing a package that does the same for other people's apps.
Everything here is the public contract of `@conciv/plugin`, installed as a normal dev dependency:

```bash
pnpm add -D @conciv/plugin effect zod
```

## The shape: up to three parts

| Part         | Runs in                     | Written with                                                  | In a folder                        | In a package                        |
| ------------ | --------------------------- | ------------------------------------------------------------- | ---------------------------------- | ----------------------------------- |
| Engine part  | the conciv engine (Node)    | `Plugin.define({id, effect})` from `@conciv/plugin/effect`    | `server` file, else `index` file   | `./server` export, else main export |
| RPC contract | both parts and the terminal | `Rpc.define({id, methods, events})` from `@conciv/plugin/rpc` | `rpc` file                         | `./rpc` export                      |
| Browser part | the widget (Solid)          | `Plugin.define({setup})` from `@conciv/plugin/experimental`   | `plugin-experimental.cjs` or `.js` | `./plugin-experimental` export      |

conciv finds plugins two ways:

- every top-level `.ts`/`.js` file and every folder in `conciv/plugins` (or `conciv/plugin`) at the
  project root, with no config; the engine watches the folder and reloads a plugin when it changes;
- the `plugins` option of `conciv()`: a package name, a `./` path, or `[name, options]`. The engine
  installs a package name with npm into its own cache. `'-<id>'` turns off an earlier plugin,
  built-ins included (`'-conciv.page'`); `'-*'` turns off all of them.

Node imports the engine part as source, with types stripped: write it as `.ts`, `.js`, `.mts`,
`.mjs`, `.cts` or `.cjs`, use only erasable syntax (no `enum`, no parameter properties), and import
siblings by their real name (`./rpc.ts`). A `.tsx`/`.jsx` engine file fails: the plugin shows as
failed with `Plugin failed to load`. The browser part is always a built bundle.

## The engine part

```ts
import {Plugin} from '@conciv/plugin/effect'
import {Effect, Ref} from 'effect'
import {z} from 'zod'
import {Deploy} from './rpc.ts'

export default Plugin.define({
  id: 'deploy',
  effect: (ctx) =>
    Effect.gen(function* () {
      const last = yield* Ref.make<string | null>(null)
      const registration = yield* ctx.rpc.register(Deploy, {
        last: () => Effect.map(Ref.get(last), (url) => ({url})),
      })
      yield* ctx.tool.transform((editor) => {
        editor.namespace({name: 'deploy', description: 'Deploy a branch of this app to a preview URL.'})
        editor.add({
          name: 'run',
          description: 'Deploy a branch to its preview URL and return the URL.',
          input: z.object({branch: z.string().regex(/^[a-z0-9-]+$/)}),
          output: z.object({url: z.string()}),
          options: {namespace: 'deploy'},
          execute: ({branch}) =>
            Effect.gen(function* () {
              const url = `https://${branch}.preview.example.com`
              yield* Ref.set(last, url)
              yield* registration.events.emit('deployed', {url}).pipe(Effect.ignore)
              return {output: {url}}
            }),
        })
      })
    }),
})
```

The effect runs in a scope that closes when the plugin stops or reloads: every tool, skill and RPC
handler it registered is removed, fibers forked with `forkScoped` are interrupted, finalizers run.
`ctx.options` holds the `[name, options]` config value: parse it with zod and fail the effect with a
tagged value on a bad one (`Plugin.define<Plugin.Services, ConfigInvalid>`), so the plugin shows as
failed with that message.

`ctx` domains: `options`, `location.directory`, `tool`, `skill`, `rpc`, `session`, `permission`,
`agent`, `event`, `storage`, `servers`. Each returns an `Effect`. The promise entry `@conciv/plugin`
is the same with `setup(ctx)` and `Promise`s.

See [tool-contract](references/tool-contract.md) for every tool field, the name rule, errors, approvals, skills and
prompt hooks.

## The RPC contract

```ts
import {Rpc} from '@conciv/plugin/rpc'
import {z} from 'zod'

export const Deploy = Rpc.define({
  id: 'deploy',
  methods: {
    last: {input: z.unknown(), output: z.object({url: z.string().nullable()})},
  },
  events: {
    deployed: {schema: z.object({url: z.string()})},
  },
})
```

Call it from a terminal in the project: `conciv plugin call deploy last`. RPC methods never ask the
user: an operation that must ask is a tool. See [rpc-and-testing](references/rpc-and-testing.md).

## The browser part

```tsx
import {createSignal, onCleanup} from 'solid-js'
import {ComposerPill, createKeyed, Plugin} from '@conciv/plugin/experimental'
import {Deploy} from './rpc.ts'

export default Plugin.define({
  setup(ctx) {
    const [url, setUrl] = createSignal<string | null>(null)

    createKeyed(
      () => ctx.client,
      (client) => {
        const controller = new AbortController()
        onCleanup(() => controller.abort())
        const follow = async () => {
          for await (const event of client.event.subscribe({
            types: ['rpc.deploy.deployed'],
            signal: controller.signal,
          })) {
            if (event.type === 'server.connected') {
              const last = await client.rpc(Deploy).last(undefined, {signal: controller.signal})
              setUrl(last.url)
              continue
            }
            const deployed = Deploy.events.deployed.schema.safeParse(event.data)
            if (deployed.success) setUrl(deployed.data.url)
          }
        }
        follow().catch((error: unknown) => {
          if (!controller.signal.aborted) console.error('[deploy] the deploy events stopped', error)
        })
      },
    )

    ctx.add(ComposerPill, {
      id: 'deploy-preview',
      show: () => {
        const current = url()
        if (current === null) return undefined
        return {label: 'Preview', icon: 'external-link', title: current, run: () => window.open(current, '_blank')}
      },
    })
  },
})
```

Build it with vite (`pnpm add -D vite vite-plugin-solid solid-js`):

```ts
import {defineConfig} from 'vite'
import {experimental} from '@conciv/plugin/experimental/vite'

export default defineConfig({
  publicDir: false,
  plugins: [experimental({entry: 'app.tsx', outFile: 'plugin-experimental.cjs'})],
})
```

`experimental()` with no options builds `src/plugin-experimental.tsx` into
`dist/plugin-experimental.cjs`. `vite build --watch` reloads only that plugin in the widget.

Registries for `ctx.add`: `Panel` (tabs in the session pane), `Slot` (`window.bottom`,
`session.header`, `session.status`, `page.overlay`), `ComposerPill`, `Command`
(keybind and slash command), `SettingsPage`, `CodeBlock`, `CodeBlockAction`, `NoteCard`,
`LinkHandler`, and the page plugin's `PageOperation`. `ctx.add` takes an item or a function that
returns one (or `undefined` for none). Everything added is withdrawn on reload.
`Plugin.define({stores})` declares `Store.global`, `Store.project` and `Store.session` values.
`ctx.provide`/`ctx.use` share contracts between plugins: `Page` and `ReactTree` from
`@conciv/plugin/experimental/page`, `GrabApi` from `@conciv/plugin/experimental/grab`. Draw with
`ctx.ui` components.

The widget provides `effect`, `zod`, `solid-js`, `solid-js/web`, `solid-js/store`,
`@conciv/plugin/experimental`, `@conciv/plugin/experimental/page`, `@conciv/plugin/experimental/grab`
and `@conciv/plugin/rpc`; the build keeps them external and fails on another `effect`, `solid-js`
or `@conciv` import.

## Testing

`@conciv/plugin-testkit` runs the real engine with a scripted model:

- `createEngine({plugins})` (the package root, `@conciv/plugin-testkit`): the engine with your plugins; the first argument is the
  product's own `ConcivConfig`. `engine.reply(...)` gives the model's answers in order, built with
  `TestLLM`; `engine.write(path, content)` puts a file in the project. `engine.session.send(text)`,
  `engine.session.tool(name).call(input)`, `engine.rpc.call(id, method, input)`, `engine.gate()`.
- `mount({engine, history})` (`/browser`): the whole widget on that engine; `history` is
  `createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})`, the engine's saved
  history, or any TanStack `RouterHistory`; the test drives it by role and text.
- Add `concivTest()` from `@conciv/plugin-testkit/vitest` to the package's `vite.config.ts` and run
  tests with the `conciv-test` bin: node (`*.test.ts`), happy-dom (`*.dom.test.tsx`) and browser
  (`*.browser.test.tsx`) projects come from it. Your own `test: {...}` settings win over the kit's.

See [rpc-and-testing](references/rpc-and-testing.md).

## Publishing

Export `.`/`./server`, `./rpc` and `./plugin-experimental` (the `.cjs`). Build with
`tsdown && vite build && tsc -p tsconfig.build.json`. `@conciv/plugin` is a peer dependency (and a
dev dependency); `effect` and `zod` are dependencies. Exclude `plugin-experimental` from attw.

## Red flags: stop and fix

- A `.tsx` engine file, or an import of `./rpc` without its extension: Node cannot load it.
- A tool name with `-`: the engine logs `Invalid tool name` and leaves the tool out.
- `{output}` returned from a tool with no `output` schema: the call fails with "Tool result declared
  output without an output schema". Declare `output`, or return `{content}`.
- A mutating tool with no ask rule and no `ctx.permission.assert`: add both.
- An RPC method that asks the user: make it a tool.
- A browser part that bundles its own `solid-js` or `effect`: the build fails on purpose; import the
  provided modules.
- Waiting for `networkidle` in a test with the widget: the socket never idles.
- A test pointed at source instead of the built `dist`: rebuild first.

## Sources

- `packages/plugin/package.json`
- `packages/plugin/src/effect/rpc.ts`
- `packages/plugin/src/effect/storage.ts`
- `packages/plugin/src/experimental/registries.ts`
- `packages/plugin/src/experimental/core.ts`
- `packages/plugin-host/src/core/tool.ts`
- `packages/plugin-testkit/README.md`
- `packages/plugin-testkit/src/engine.ts`
- `packages/plugin-testkit/src/mount.ts`
- `packages/plugin-testkit/src/test-projects.ts`
- `packages/plugins/tanstack/package.json`
- `packages/plugins/tanstack/src/index.ts`
- `packages/plugins/tanstack/src/plugin-experimental.tsx`
- `packages/plugins/test-runner/src/index.ts`
- `packages/plugins/test-runner/src/plugin-experimental.tsx`
- `packages/plugins/recorder/src/tools.ts`
- `packages/plugins/ios/src/tools.ts`
- `apps/site/content/docs/plugins/index.mdx`
- `apps/site/content/docs/plugins/engine.mdx`
- `apps/site/content/docs/plugins/browser.mdx`
