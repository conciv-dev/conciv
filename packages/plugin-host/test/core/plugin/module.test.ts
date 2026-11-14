import {expect} from 'vitest'
import {access, mkdir, writeFile} from 'node:fs/promises'
import {setTimeout} from 'node:timers/promises'
import path from 'node:path'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Exit, Fiber, Layer, Schedule, Scope, Stream} from 'effect'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {ManagedPolicy} from '../../../src/core/managed-policy.js'
import {Plugin} from '../../../src/core/plugin.js'
import {PluginModule} from '../../../src/core/plugin/module.js'
import {EffectFlock} from '../../../src/util/effect-flock.js'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Npm} from '../../../src/util/npm.js'
import {setOrganizationPolicy} from '../fixture/policy'
import {tmpdirScoped} from '../fixture/tmpdir'
import {testEffect} from '../lib/effect'
import {PluginTestLayer, temporaryGlobalLayer} from './fixture'

const it = testEffect(
  Layer.mergeAll(
    PluginTestLayer,
    Npm.layer.pipe(
      Layer.provide(EffectFlock.layer),
      Layer.provide(temporaryGlobalLayer),
      Layer.provide(FSUtil.layer),
      Layer.provide(NodeFileSystem.layer),
    ),
    Watcher.layer().pipe(Layer.provide(Watcher.nativeLayer)),
    Layer.succeed(ManagedPolicy.ConfiguredPolicies, []),
  ),
)

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  )

const write = async (file: string, text: string) => {
  await mkdir(path.dirname(file), {recursive: true})
  await writeFile(file, text)
}

it.live('watches creation of an external helper with missing parent directories', () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const entry = path.join(directory.path, 'plugin/index.ts')
    yield* Effect.promise(() => write(entry, 'export { default } from "../shared/new/nested/helper.ts"'))
    const modules = yield* PluginModule.make()
    const operation = {type: 'add' as const, target: path.dirname(entry), options: {}}
    expect(Exit.isFailure(yield* modules.load(operation).pipe(Effect.exit))).toBe(true)
    const armed = yield* modules.changes().pipe(Stream.runHead, Effect.forkScoped({startImmediately: true}))
    let probes = 0
    yield* Effect.promise(() => mkdir(path.join(directory.path, `probe-${probes++}`))).pipe(
      Effect.andThen(Fiber.join(armed).pipe(Effect.timeout('500 millis'))),
      Effect.retry(Schedule.forever),
      Effect.timeout('10 seconds'),
    )
    const changed = yield* modules
      .changes()
      .pipe(Stream.runHead, Effect.timeout('5 seconds'), Effect.forkScoped({startImmediately: true}))
    yield* Effect.promise(() =>
      write(
        path.join(directory.path, 'shared/new/nested/helper.ts'),
        'export default { id: "appeared", async setup() {} }',
      ),
    )
    yield* Fiber.join(changed)
    const loaded = yield* modules.load(operation)
    expect(loaded).toMatchObject({id: 'appeared'})
  }),
)

it.live('interrupts pending watcher setup when the loader scope closes during module evaluation', () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const entry = path.join(directory.path, 'index.ts')
    const entered = path.join(directory.path, 'entered')
    const release = path.join(directory.path, 'release')
    const started = yield* Deferred.make<void>()
    const stopped = yield* Deferred.make<void>()
    const gate = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => writeFile(release, 'release')).pipe(
        Effect.andThen(Deferred.succeed(gate, undefined)),
        Effect.andThen(Scope.close(scope, Exit.void)),
      ),
    )
    yield* Effect.promise(() =>
      writeFile(
        entry,
        `
        import { access, writeFile } from "node:fs/promises"
        import { setTimeout } from "node:timers/promises"
        await writeFile(${JSON.stringify(entered)}, "entered")
        while (!(await access(${JSON.stringify(release)}).then(() => true, () => false))) await setTimeout(5)
        export default { id: "pending", async setup() {} }
      `,
      ),
    )
    const modules = yield* PluginModule.make().pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.provideService(Watcher.Service, {
        subscribe: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(gate)),
            Effect.ensuring(Deferred.succeed(stopped, undefined)),
            Effect.as(Stream.never),
          ),
      }),
    )
    yield* modules.load({type: 'add', target: directory.path, options: {}}).pipe(Effect.forkIn(scope))
    yield* Deferred.await(started)
    yield* Effect.promise(() => exists(entered)).pipe(
      Effect.repeat({until: (found) => found, schedule: Schedule.spaced('5 millis')}),
      Effect.timeout('2 seconds'),
    )
    yield* Scope.close(scope, Exit.void)
    expect(yield* Deferred.isDone(stopped)).toBe(true)
    yield* Effect.promise(() => writeFile(release, 'release'))
    yield* Effect.promise(() => setTimeout(50))
  }),
)

it.live('blocks a local plugin before module initialization and honors replacement policies', () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const entered = path.join(directory.path, 'entered')
    yield* Effect.promise(() =>
      writeFile(
        path.join(directory.path, 'index.ts'),
        `
      import { writeFile } from "node:fs/promises"
      await writeFile(${JSON.stringify(entered)}, "loaded")
      export default { id: "policy-fixture", async setup() {} }
    `,
      ),
    )
    const operation = {type: 'add' as const, target: directory.path, options: {}}
    const blocked = yield* PluginModule.make().pipe(
      setOrganizationPolicy([{action: 'plugin.use', resource: directory.path, effect: 'deny'}]),
    )
    expect(yield* blocked.load(operation)).toEqual({blocked: true})
    expect(yield* Effect.promise(() => exists(entered))).toBe(false)
    const modules = yield* PluginModule.make().pipe(setOrganizationPolicy(undefined))
    expect(yield* modules.load(operation)).toMatchObject({id: 'policy-fixture'})
    expect(yield* Effect.promise(() => exists(entered))).toBe(true)
  }),
)

it.live('loads an experimental-only package under its package name without running it', () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const experimental = path.join(directory.path, 'experimental')
    const evaluated = 'throw new Error("A client part must not run on the server")'
    yield* Effect.promise(() =>
      Promise.all([
        write(
          path.join(experimental, 'package.json'),
          JSON.stringify({
            name: 'opencode-acme-experimental',
            exports: {'./plugin-experimental': './dist/plugin-experimental.cjs'},
          }),
        ),
        write(path.join(experimental, 'dist/plugin-experimental.cjs'), evaluated),
      ]),
    )
    const modules = yield* PluginModule.make()
    const plugins = yield* Plugin.Service

    const loaded = yield* modules.load({type: 'add', target: experimental, options: {region: 'eu'}})
    expect(loaded).toMatchObject({
      id: 'opencode-acme-experimental',
      features: {experimental: true},
      experimental: {options: {region: 'eu'}},
      source: {type: 'local', path: experimental},
    })
    if ('pending' in loaded || 'blocked' in loaded) return yield* Effect.die(new Error('The plugin was not loaded'))

    yield* plugins.activate([loaded])
    yield* plugins.awaitActivation
    expect((yield* plugins.list()).filter((plugin) => plugin.source.type === 'local')).toEqual([
      {
        id: Plugin.Id.make('opencode-acme-experimental'),
        source: {type: 'local', path: experimental},
        state: {status: 'active'},
        features: {experimental: true},
      },
    ])
  }),
)

for (const target of ['policy-fixture@1.2.3', '@scope/policy-fixture@1.2.3']) {
  it.live(`blocks versioned package ${target} before npm resolution or installation`, () =>
    Effect.gen(function* () {
      const modules = yield* PluginModule.make().pipe(
        setOrganizationPolicy([
          {action: 'plugin.use', resource: target.slice(0, target.lastIndexOf('@')), effect: 'deny'},
        ]),
      )
      const operation = {type: 'add' as const, target, options: {}}
      expect(yield* modules.load(operation, {install: false})).toEqual({blocked: true})
      expect(yield* modules.load(operation, {install: true})).toEqual({blocked: true})
    }),
  )
}

it.live('loads a local TypeScript plugin with an enum, a .tsx module and a ./helper.js import of helper.ts', () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const pluginDirectory = path.join(directory.path, 'typescript-plugin')
    yield* Effect.promise(() =>
      Promise.all([
        write(
          path.join(pluginDirectory, 'node_modules/react/package.json'),
          '{"name":"react","type":"module","exports":{"./jsx-runtime":"./jsx-runtime.js"}}',
        ),
        write(
          path.join(pluginDirectory, 'node_modules/react/jsx-runtime.js'),
          'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx; export const Fragment = "fragment"',
        ),
        write(path.join(pluginDirectory, 'helper.ts'), 'export enum Mode { Ready = "ready" }'),
        write(path.join(pluginDirectory, 'view.tsx'), 'export const view: { type: string } = <strong>ready</strong>'),
        write(path.join(pluginDirectory, 'plain.ts'), 'export const plain: string = "plain"'),
        write(path.join(pluginDirectory, 'lib/index.ts'), 'export const lib: string = "lib"'),
        write(path.join(pluginDirectory, 'twin.mts'), 'export const twin: string = "twin"'),
        write(path.join(pluginDirectory, 'kind.mts'), 'export enum Kind { Value = "kind" }'),
        write(path.join(pluginDirectory, 'count.cts'), 'export enum Count { Value = "count" }'),
        write(
          path.join(pluginDirectory, 'index.ts'),
          `import { Mode } from "./helper.js"
import { view } from "./view.js"
import { plain } from "./plain"
import { lib } from "./lib"
import { twin } from "./twin.mjs"
import { Kind } from "./kind.mts"
import counted from "./count.cts"
export default { id: [\`typescript-\${Mode.Ready}-\${view.type}\`, plain, lib, twin, Kind.Value, counted.Count.Value].join("-"), effect: () => undefined }`,
        ),
      ]),
    )
    const modules = yield* PluginModule.make()
    const operation = {type: 'add' as const, target: pluginDirectory, options: {}}
    const loaded = yield* modules.load(operation)
    expect(loaded).toMatchObject({id: 'typescript-ready-strong-plain-lib-twin-kind-count', features: {server: true}})
    const changed = yield* modules
      .changes()
      .pipe(Stream.runHead, Effect.timeout('5 seconds'), Effect.forkScoped({startImmediately: true}))
    yield* Effect.promise(() => write(path.join(pluginDirectory, 'plain.ts'), 'export const plain: string = "edited"'))
    yield* Fiber.join(changed)
    expect(yield* modules.load(operation)).toMatchObject({id: 'typescript-ready-strong-edited-lib-twin-kind-count'})
  }),
)
