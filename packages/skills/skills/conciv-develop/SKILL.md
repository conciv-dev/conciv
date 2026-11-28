---
name: conciv-develop
description: Use when building a conciv plugin in your own app or as a package, a folder under conciv/plugins/ (or a package listed in the conciv() `plugins` option) that adds agent tools, skills, prompt rules or RPC methods to the engine with Plugin.define from @conciv/backend-plugin-api, and panels, slots, composer pills, commands, settings or tool cards to the widget with @conciv/frontend-plugin-api. Covers the engine part, the RPC contract (Rpc.define), the browser part and its vite build, approvals, and testing with @conciv/backend-test-utils. This is the consumer-facing skill, for an app that depends on the published plugin APIs, not conciv's own source.
metadata:
  package: '@conciv/skills'
---

# Building a conciv plugin

## Who this is for

You are a developer (or an agent working in a developer's app) adding a plugin to teach the conciv
agent a new capability, or publishing a package that does the same for other people's apps. Everything
here is the public contract of two published packages:

- `@conciv/backend-plugin-api`: the engine part and the RPC contract. Add `zod`, and `effect` for the
  Effect entry.
- `@conciv/frontend-plugin-api`: the browser part, with `solid-js`, and `vite` plus `vite-plugin-solid`
  for its build (optional peer dependencies of the package).

## The shape: up to three parts

| Part         | Runs in                     | Written with                                                               | In a folder                           | In a package                       |
| ------------ | --------------------------- | -------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| Engine part  | the conciv engine (Node)    | `Plugin.define` from `@conciv/backend-plugin-api/effect` or the root entry | a `server` file, else an `index` file | the `./server` export, else `.`    |
| RPC contract | both parts and the terminal | `Rpc.define({id, methods, events})` from `@conciv/protocol/schema/rpc`     | an `rpc` file                         | the `./rpc` export                 |
| Browser part | the widget (Solid)          | `Plugin.define({setup})` from `@conciv/frontend-plugin-api`                | `plugin-experimental.cjs` or `.js`    | the `./plugin-experimental` export |

The engine finds the parts with `resolve` in `packages/backend-plugin-api/src/host.ts:17-42`.

conciv finds plugins two ways (`apps/site/content/docs/plugins/index.mdx`):

- every `.ts`/`.js` file and every folder in `conciv/plugins` (or `conciv/plugin`) at the project
  root, with no config. The engine watches these folders and loads a plugin again when its files
  change.
- the `plugins` option of `conciv()`: a package name, a path (`./` and `../` start at the project
  folder), or `[name, options]` with JSON option values. The engine installs a package name with npm
  into its own cache. A string that starts with `-` turns off the plugin with that id
  (`parse`, `packages/backend-app-api/src/core/config/plugin/source.ts:184-192`).

Node imports the engine part itself, with its own type stripping: write it as `.ts` or `.js` (or
`.mts`, `.mjs`, `.cts`, `.cjs`), with erasable syntax only (no `enum`, no parameter properties) and no
JSX. A sibling import may name the `.js` twin of a `.ts` file, as the example's `./rpc.js` does. The
browser part is always a built bundle. A plugin that fails to load shows as failed with its error, or
`Plugin failed to load` (`packages/backend-app-api/src/core/plugin/supervisor.ts:69`).

## A folder plugin: the example app's deploy plugin

The engine part, `Plugin.define` with `setup` (the promise entry), from `apps/examples/tanstack-start/conciv/plugins/deploy/index.ts:1-34`:

```ts
import {Plugin, Skill} from '@conciv/backend-plugin-api'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import {Deploy} from './rpc.js'

const description = 'Deploy the current branch'

const run = async ({env}: {env: 'staging' | 'prod'}) => ({url: `https://${env}.example.com`})

export default Plugin.define({
  id: 'deploy',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'run',
        description,
        input: Deploy.methods.run.input,
        output: Deploy.methods.run.output,
        options: {namespace: 'deploy'},
        execute: async (input) => ({output: await run(input)}),
      })
    })
    await ctx.skill.transform((skills) => {
      skills.add({
        id: Skill.Id.make('deploy'),
        name: Skill.Name.make('Deploy'),
        description: `${description}.`,
        path: AbsolutePath.make('skill://deploy/SKILL.md'),
        content: 'You can deploy from code mode with `external_deploy_run`.',
      })
    })
    const registration = await ctx.rpc.register(Deploy, {run})
    return () => registration.dispose()
  },
})
```

The `Rpc.define` contract, from `apps/examples/tanstack-start/conciv/plugins/deploy/rpc.ts:1-8`:

```ts
import {z} from 'zod'
import * as Rpc from '@conciv/protocol/schema/rpc'

export const Deploy = Rpc.define({
  id: 'deploy',
  methods: {run: {input: z.object({env: z.enum(['staging', 'prod'])}), output: z.object({url: z.string()})}},
  events: {},
})
```

The browser part, `Plugin.define` with a `setup` that adds a `ComposerPill` and a `Slot`, from `apps/examples/tanstack-start/conciv/plugins/deploy/plugin-experimental.tsx:1-13`:

```tsx
import {ComposerPill, Plugin, Slot, type ComposerPillView} from '@conciv/frontend-plugin-api'

export default Plugin.define({
  setup(ctx) {
    const view: ComposerPillView = {
      label: 'Deploy',
      icon: 'arrow-up',
      run: () => ctx.toast.show({title: 'Deploy requested'}),
    }
    ctx.add(ComposerPill, {id: 'deploy', show: () => view})
    ctx.add(Slot, {at: 'session.status', render: () => <span>env: staging</span>})
  },
})
```

Its build with `experimental`, from `apps/examples/tanstack-start/conciv/plugins/deploy/vite.config.ts:1-13`, run with
`vite build --config conciv/plugins/deploy/vite.config.ts` (add `--watch` while you work):

```ts
import {defineConfig} from 'vite'
import {experimental} from '@conciv/frontend-plugin-api/vite'

export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  plugins: [
    experimental({
      entry: 'conciv/plugins/deploy/plugin-experimental.tsx',
      outFile: 'conciv/plugins/deploy/plugin-experimental.cjs',
    }),
  ],
})
```

Call it from a terminal in the project: `conciv plugin call deploy run --data '{"env":"staging"}'`
(`apps/examples/tanstack-start/conciv/README.md`).

## The engine part with Effect

`@conciv/backend-plugin-api/effect` is the same API where every `ctx` domain returns an `Effect`. Every
plugin conciv ships uses it. `Plugin.define({id, effect})` runs `effect(ctx)` in a scope that closes
when the plugin stops, reloads or is turned off: every tool, skill and RPC handler it registered goes
with it, and so does a fiber started with `Effect.forkScoped`. The test runner, from
`packages/plugins/test-runner/src/test-runner.ts:58-77`:

```ts
export default Plugin.define<RunnerServices>({
  id: 'test-runner',
  effect: Effect.fn('TestRunner.plugin')(function* (ctx: Context) {
    const config = TestRunnerConfigSchema.safeParse(ctx.options)
    if (!config.success) return yield* Effect.die(config.error)
    const adapter = getRunner(config.data.runner) ?? vitest
    const manager = yield* adapter.create(ctx.location.directory).pipe(Effect.orDie)
    yield* register(ctx, manager)
    yield* ctx.skill.transform((editor) => editor.add(info))
    const registration = yield* registerRpc(ctx.rpc, manager).pipe(Effect.orDie)
    yield* manager.events.pipe(
      Stream.runForEach((event) =>
        registration.events
          .emit('event', event)
          .pipe(Effect.catchCause((cause) => Effect.logError('a live test event was not delivered', cause))),
      ),
      Effect.forkScoped({startImmediately: true}),
    )
  }),
})
```

`ctx.options` holds the `[name, options]` config value: parse it with zod. `Plugin.define<R, E>` takes
the services the effect needs and the error it may fail with
(`packages/backend-plugin-api/src/effect/plugin.ts:52-59`). The `ctx` fields are `app`, `location`,
`options`, `agent`, `event`, `model`, `permission`, `plugin`, `rpc`, `session`, `skill`, `storage`,
`tool` and `servers` (`packages/backend-plugin-api/src/effect/plugin.ts:18-43`). The promise entry,
`@conciv/backend-plugin-api`, has the same domains with `setup(ctx)` and `Promise`s; `setup` may
return a cleanup.

## Errors

Every error a plugin throws or fails with comes from one evlog error catalog, kept in the plugin's own
`errors.ts` beside the code that fails. Each entry has a `message` (a function when it needs values),
and `why` and `fix` where the user or the agent can act on it; `status` only where it means an HTTP
status. Never write `new Error`, `Data.TaggedError`, `Schema.TaggedError` or an error class.

```ts
import {defineErrorCatalog} from 'evlog'

export const deployErrors = defineErrorCatalog('deploy', {
  TARGET_DOWN: {
    message: ({env}: {env: string}) => `${env} is not answering`,
    why: 'The deploy target did not answer its health check.',
    fix: 'Check that the target is up, then deploy again.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    deploy: typeof deployErrors
  }
}
```

Fail with `Effect.fail(deployErrors.TARGET_DOWN({env}))` (or `throw deployErrors.TARGET_DOWN({env})` in the
promise entry). Branch on the code, never on a tag:
`Effect.catchIf((error) => error.code === deployErrors.TARGET_DOWN.code, handle)`. A third-party error the
plugin rethrows becomes the `cause`: `deployErrors.TARGET_DOWN({env, cause: error})`. The values in the
message are not kept on the error; a handler that needs them reads them from `internal`.

See [tool-contract](references/tool-contract.md) for every tool field, the name rule, errors,
approvals, skills and prompt hooks.

## The RPC contract

The test runner's, from `packages/plugins/test-runner/src/rpc.ts:23-33`:

```ts
export const TestRunner = Rpc.define({
  id: 'test-runner',
  methods: {
    status: {input: NoInputSchema, output: TestRunResultSchema},
    current: {input: NoInputSchema, output: CurrentRunSchema},
    list: {input: ListInputSchema, output: ListResultSchema, errors: unavailable},
    run: {input: RunArgsSchema, output: TestRunResultSchema, errors: unavailable},
    stop: {input: NoInputSchema, output: z.object({ok: z.boolean()})},
  },
  events: {event: {schema: TestEventSchema}},
})
```

Keep it in its own module and export it as `./rpc`, so the engine part, the browser part, other plugins
and the terminal import the same object. RPC methods never ask the user: an operation that must ask is
a tool. See [rpc-and-testing](references/rpc-and-testing.md).

## The browser part

`Plugin.define({setup})` is the default export. It declares no id: the widget gives it the engine
part's id as `ctx.id`. `setup` runs synchronously. Everything added with `ctx.add(Registry, item)` is
removed when the plugin reloads or stops, and `ctx.signal` aborts then
(`apps/site/content/docs/plugins/first-plugin.mdx`).

`ctx.client.rpc(Contract)` calls the plugin's own engine part, typed from the contract. The client is
new after the engine restarts, so read `ctx.client` where you call it. From
`packages/plugins/test-runner/src/follow.ts:17-27`:

```ts
function readRun(client: Client) {
  return Effect.tryPromise({
    try: async (signal) => {
      const runner = client.rpc(TestRunner)
      const status = await runner.status(undefined, {signal})
      const current = await runner.current(undefined, {signal})
      return {status, current}
    },
    catch: (cause) => makeReadFailed({cause}),
  })
}
```

Events arrive on `client.event.subscribe({types: ['rpc.<id>.<event>']})`. A `server.connected` event
comes when the engine connection comes back: read the current state again then
(`packages/plugins/test-runner/src/follow.ts:29-33`).

Registries for `ctx.add` (`packages/frontend-plugin-api/src/registries.ts:414-574`): `Panel` (tabs in the
session pane), `Slot` (`window.bottom`, `session.header`, `session.status`, `page.overlay`),
`ComposerPill`, `Command` (keybind and slash command), `SettingsPage`, `ToolRegistry` (a card for a
tool's calls), `CodeBlock`, `CodeBlockAction`, `LinkHandler`, `Server` and `Style` (CSS imported with
`?inline`; the widget fences every rule of it to the plugin's own `data-conciv-plugin` area,
`packages/frontend-app-api/src/plugin/render.tsx:93-132`), and the page plugin's `PageOperation` from `@conciv/frontend-plugin-api/page`. `ctx.add`
takes an item, or a function that returns one (or `undefined` for none). `Plugin.define({stores})`
declares `Store.global`, `Store.project` and `Store.session` values
(`packages/frontend-plugin-api/src/core.ts:219-260`). `ctx.provide` and `ctx.use` share contracts
between plugins: `Page` and `ReactTree` from `@conciv/frontend-plugin-api/page`
(`packages/frontend-plugin-api/src/page.ts:23-70`; `Page.pick()` lets the user pick an element and
returns the `Grab`). Follow a changing source with `createKeyed`
(`packages/frontend-plugin-api/src/reactive.ts:59`). Draw with `ctx.ui` components, so the plugin looks
like the widget.

The widget's sheet holds the classes of the widget, its kits and the built-in plugins
(`packages/app/uno.config.ts`), nothing else. Any other plugin ships its own: in this repo its
`uno.config.ts` is `pluginSheetConfig(import.meta.url)` (`packages/uno-preset/src/uno-preset.ts`), its
`scripts/build-css.ts` (the `build:css` script, which `build` runs first) writes the sheet to `src/.generated/css.ts`
with `buildShadowCss` (`@internal/uno-preset/build-shadow-css`), and its browser part imports `./.generated/css.js`
and adds it with `ctx.add(Style, css)` (`packages/plugins/whiteboard/src/plugin-experimental.tsx`). A popover it opens keeps the fence through
`LayerAreaContext` (`packages/ui-kit-system/src/layer-portal.tsx`).

A mounted session's `browserTab` (`packages/frontend-plugin-api/src/host-apis.ts:213`) is the browser tab this
widget opened for it, the id the engine lists in `tabs.list`; the engine part reads the list with
`ctx.browserTabs` (`packages/backend-plugin-api/src/effect/plugin.ts:50-53`).

`experimental()` from `@conciv/frontend-plugin-api/vite` builds `src/plugin-experimental.tsx` into
`dist/plugin-experimental.cjs` by default; `entry` and `outFile` change both
(`packages/frontend-plugin-api/src/vite.ts:7-44`). The widget provides `effect`, `zod`, `solid-js`,
`solid-js/web`, `solid-js/store`, `@conciv/client`, `@conciv/frontend-plugin-api`,
`@conciv/frontend-plugin-api/page`, `@conciv/frontend-plugin-api/grab` and
`@conciv/protocol/schema/rpc` (`packages/frontend-plugin-api/src/modules.ts:1-16`). The build keeps
them external and fails on any other `effect`, `solid-js` or `@conciv` import.

## Testing

`@conciv/backend-test-utils` is published, so a plugin in its own repo can
use it. `test` from `@conciv/backend-test-utils` is vitest's `test` with a `createEngine` fixture:
`createEngine(config, start)` starts the real engine on a free port with a scripted model in place of
the agent's CLI. `config` is the product's own conciv config, so a test adds the plugin the way a user
does. From `packages/plugins/test-runner/test/it/tools.it.test.ts:1-21`:

```ts
import {describe} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {TestLLM} from '@conciv/backend-test-utils'

describe("the agent runs the project's tests", () => {
  test('the agent is told about the runner, lists the files, reads an empty status, runs everything, narrows a run with a pattern, reads the last run, and two runs asked at once each report their own tests', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['@conciv/plugin-test-runner']},
      {directory: 'test/fixtures/plant-shop'},
    )
    await engine.reply(TestLLM.text('I will run them'))
    await engine.session.send('Run the tests')

    const [request] = await engine.requests()
    expect(request?.system.join('\n')).toContain('    <id>test-runner</id>')
    expect(request?.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['test_runner_run', 'test_runner_status']),
    )
```

A package name in `config.plugins` is the package under test, or one installed for it (`pluginDirectory`,
`packages/engine-kit/src/plugin-directory.ts:16-29`), loaded from its built `.` export: build the plugin
before a run. The fixture stops every engine its test started when the test ends. See
[rpc-and-testing](references/rpc-and-testing.md) for what the engine gives a test.

What a plugin outside this repo cannot use: `@internal/frontend-test-utils` (`renderInTestApp`,
`renderTestApp`, `createExtensionTester`) and `@internal/vitest-config` (`concivTest()`) are private
and not published. So it has no widget render helpers, and no browser-mode `createEngine`: the browser
commands are exported from `@conciv/backend-test-utils/vitest`, but registering them is `concivTest()`'s
job (`apps/site/content/docs/plugins/guides/testing.mdx`). Test the engine part in node with `createEngine`.

## Publishing

Export `.` and `./server` (the engine part), `./rpc` and `./plugin-experimental` (the `.cjs`), as the
test runner does (`packages/plugins/test-runner/package.json`). The test runner builds with
`tsdown && vite build`: `tsdown.config.ts` builds the engine part and the bundle's types, then `vite.config.ts`
builds the `./plugin-experimental` bundle with `experimental()`. `@conciv/backend-plugin-api` and
`@conciv/frontend-plugin-api` are peer dependencies (and dev dependencies); `effect`, `zod` and
`@conciv/protocol` are dependencies.

## Red flags: stop and fix

- A `.tsx` engine file, or TypeScript syntax Node cannot strip: Node cannot load it.
- A tool name with `-`: the engine logs `Skipping invalid tool registration` with `Invalid tool name`
  and leaves the tool out (`packages/backend-app-api/src/core/tool.ts:331-332`).
- `{output}` returned from a tool with no `output` schema: the call fails with "Tool result declared
  output without an output schema" (`packages/backend-app-api/src/core/tool/runtime.ts:34`). Declare
  `output`, or return `{content}`.
- A tool that changes real state with no ask rule and no `ctx.permission.assert`: add both.
- An RPC method that asks the user: make it a tool.
- A browser part that bundles its own `solid-js` or `effect`: the build fails on purpose; import the
  provided modules.
- Waiting for `networkidle` in a test with the live widget: the socket never idles.
- A test run against a stale `dist`: `createEngine` loads the built plugin, so rebuild first.

## Sources

- `packages/backend-plugin-api/package.json`
- `packages/backend-plugin-api/src/host.ts`
- `packages/backend-plugin-api/src/effect/plugin.ts`
- `packages/backend-plugin-api/src/promise/promise.ts`
- `packages/backend-app-api/src/core/config/plugin/source.ts`
- `packages/backend-app-api/src/core/plugin/supervisor.ts`
- `packages/backend-app-api/src/core/tool.ts`
- `packages/backend-app-api/src/core/tool/runtime.ts`
- `packages/frontend-plugin-api/package.json`
- `packages/frontend-plugin-api/src/registries.ts`
- `packages/frontend-plugin-api/src/core.ts`
- `packages/frontend-plugin-api/src/page.ts`
- `packages/frontend-plugin-api/src/reactive.ts`
- `packages/frontend-plugin-api/src/vite.ts`
- `packages/frontend-plugin-api/src/modules.ts`
- `packages/backend-test-utils/src/backend-test-utils.ts`
- `packages/engine-kit/src/plugin-directory.ts`
- `apps/examples/tanstack-start/conciv/plugins/deploy/index.ts`
- `apps/examples/tanstack-start/conciv/plugins/deploy/rpc.ts`
- `apps/examples/tanstack-start/conciv/plugins/deploy/plugin-experimental.tsx`
- `apps/examples/tanstack-start/conciv/plugins/deploy/vite.config.ts`
- `apps/examples/tanstack-start/conciv/README.md`
- `packages/plugins/test-runner/package.json`
- `packages/plugins/test-runner/src/test-runner.ts`
- `packages/plugins/test-runner/src/rpc.ts`
- `packages/plugins/test-runner/src/follow.ts`
- `packages/plugins/test-runner/test/it/tools.it.test.ts`
- `apps/site/content/docs/plugins/index.mdx`
- `apps/site/content/docs/plugins/guides/tool.mdx`
- `apps/site/content/docs/plugins/first-plugin.mdx`
- `apps/site/content/docs/plugins/guides/testing.mdx`
