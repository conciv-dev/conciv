import type {HarnessAdapter} from '@conciv/harness'
import type {Plugin as PluginDefinition} from '@conciv/plugin'
import type {Plugin as EffectPlugin} from '@conciv/plugin/effect/plugin'
import {Model} from '@conciv/plugin/schema/model'
import type {createChatPlane} from '@conciv/chat'
import type {ConcivDb} from '@conciv/db'
import {existsSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {NodeChildProcessSpawner, NodeFileSystem, NodePath} from '@effect/platform-node'
import {FetchHttpClient} from 'effect/http'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {
  Agent,
  Bus,
  ConfigPluginSource,
  Database,
  EffectFlock,
  FileSystem,
  FileSystemSearch,
  FSUtil,
  InstancePlugins,
  KV,
  Location,
  Npm,
  Permission,
  PermissionSaved,
  Plugin,
  Image,
  PluginHooks,
  PluginPromise,
  PluginSupervisor,
  PluginUpdate,
  Ripgrep,
  RipgrepBinary,
  Rpc,
  SdkPlugins,
  Session,
  SessionProjector,
  Skill,
  SkillInstructions,
  Tool,
  Watcher,
  Model as HostModel,
  App,
  ConfigAgentPlugin,
  ConfigPolicy,
  Global,
  ManagedPolicy,
  PluginHost,
} from '@conciv/plugin-host'
import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  FileSystem as PlatformFileSystem,
  Layer,
  ManagedRuntime,
  PlatformError,
  Schedule,
  Schema,
  Scope,
  Queue,
  Stream,
} from 'effect'
import type {PluginHost as PluginHostRuntime} from '../api/rpc/mount.js'
import type {ResolvedConcivConfig} from '../config.js'
import * as EventFeed from '../event-feed.js'
import {provideInstructionEntries} from './instruction-entries.js'
import {permissionSessions} from './permission-cards.js'
import {provideSessions} from './plugin-sessions.js'
import {provideServersSource} from './servers-source.js'
import type {HarnessModel} from '@conciv/protocol/harness-types'
import {uniq} from 'es-toolkit'
import {buildHarnessMenuEntry} from '../api/rpc/sessions.js'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import * as Bundler from '@conciv/plugin/schema/bundler'
import corePackage from '../../package.json' with {type: 'json'}

export function provideBundlerSource(bundler: Bundler.BundlerBridge | undefined) {
  return Layer.succeed(PluginHost.BundlerSource, bundler)
}

function diagnostics(subscribe: NonNullable<Bundler.BundlerBridge['subscribe']>) {
  return Stream.callback<Bundler.Diagnostic>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => subscribe((diagnostic) => Queue.offerUnsafe(queue, diagnostic))),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  )
}

const followDiagnostics = Effect.fn('core.bundler.followDiagnostics')(function* (
  bundler: Bundler.BundlerBridge | undefined,
) {
  const subscribe = bundler?.subscribe?.bind(bundler)
  if (subscribe === undefined) return
  const bus = yield* Bus.Service
  yield* diagnostics(subscribe).pipe(
    Stream.runForEach((diagnostic) => bus.publish(Bundler.Event.Diagnostic, {diagnostic})),
    Effect.forkScoped,
  )
})

export function publishBundlerDiagnostics(bundler: Bundler.BundlerBridge | undefined) {
  return Layer.effectDiscard(followDiagnostics(bundler))
}

export function provideEditorSource(openInEditor: (file: string, line?: number, column?: number) => void) {
  return Layer.succeed(PluginHost.EditorSource, openInEditor)
}

export function provideApp() {
  return Layer.succeed(App.Service, App.make({version: corePackage.version}))
}

export function provideConfiguredPolicies(policies: ConcivConfig['policies']) {
  return Layer.effect(
    ManagedPolicy.ConfiguredPolicies,
    Schema.decodeUnknownEffect(Schema.Array(ConfigPolicy.Info))(policies ?? []).pipe(Effect.orDie),
  )
}

export function provideConfiguredPermissions(permissions: ResolvedConcivConfig['permissions']) {
  return Layer.succeed(ConfigAgentPlugin.ConfiguredPermissions, permissions)
}

const isTransientErrno = Schema.is(Schema.Struct({code: Schema.Literals(['EMFILE', 'ENFILE', 'EAGAIN', 'EBUSY'])}))

const isTransientMkdirError = (error: PlatformError.PlatformError): boolean => isTransientErrno(error.reason.cause)

const makeRoots = Effect.fn('core.globalRoots.make')(function* (roots: Global.Interface) {
  const files = yield* PlatformFileSystem.FileSystem
  yield* Effect.forEach(
    [roots.cache, roots.config, roots.state],
    (directory) =>
      files
        .makeDirectory(directory, {recursive: true})
        .pipe(Effect.retry({while: isTransientMkdirError, schedule: Schedule.exponential('50 millis'), times: 5})),
    {discard: true},
  )
}, Effect.orDie)

export function provideGlobalRoots(home: string) {
  const roots = {cache: join(home, 'cache'), config: home, state: join(home, 'state')}
  return Layer.unwrap(makeRoots(roots).pipe(Effect.as(Global.layerWith(roots))))
}

function harnessModelInfo(harnessId: string, model: HarnessModel): HostModel.Info {
  const defaults = HostModel.Info.default(
    HostModel.Info.fields.providerId.make(harnessId),
    HostModel.Info.fields.id.make(model.id),
  )
  return {
    ...defaults,
    name: model.name,
    enabled: model.disabled !== true,
    limit: {context: model.contextWindow ?? defaults.limit.context, output: 0},
    variants: (model.efforts ?? []).map((effort) => ({
      id: HostModel.Info.fields.variants.value.fields.id.make(effort),
      settings: {effort},
    })),
  }
}

const listedModels = Effect.fn('core.models.list')(function* (harness: HarnessAdapter, signal: AbortSignal) {
  yield* Effect.annotateCurrentSpan({harness: harness.id})
  const entry = yield* Effect.promise(() => buildHarnessMenuEntry(harness, signal))
  const all = entry.models.map((model) => harnessModelInfo(harness.id, model))
  return {all, available: all.filter((model) => model.enabled), defaultModel: entry.defaultModel}
})

export function provideHarnessModels(harness: HarnessAdapter, signal: AbortSignal) {
  return Layer.succeed(
    HostModel.Service,
    HostModel.Service.of({
      available: (types) =>
        listedModels(harness, signal).pipe(
          Effect.map(({available}) =>
            types === undefined || types.length === 0
              ? available
              : uniq(types).flatMap((type) => available.filter((model) => (model.type ?? 'chat') === type)),
          ),
        ),
      default: () =>
        listedModels(harness, signal).pipe(
          Effect.map(({all, available, defaultModel}) => {
            const requested = all.find((model) => model.id === defaultModel)
            return requested?.enabled ? requested : available[0]
          }),
        ),
    }),
  )
}

export type PluginRuntimeInput = {
  db: ConcivDb
  cwd: string
  home: string
  fallbackRoots: string
  engineId: string
  config: Pick<ResolvedConcivConfig, 'plugins' | 'policies' | 'permissions'>
  plugins: readonly PluginDefinition.Plugin[]
  post: readonly EffectPlugin[]
  harness: HarnessAdapter
  signal: AbortSignal
  bundler: Bundler.BundlerBridge | undefined
  openInEditor: (file: string, line?: number, column?: number) => void
  sessions: Parameters<typeof provideSessions>[0]
  configProvider: ConfigProvider.ConfigProvider
}

const VCS_MARKERS = [
  {type: 'git', marker: '.git'},
  {type: 'hg', marker: '.hg'},
]

function detectVcs(directory: string): Location.Interface['vcs'] {
  const found = VCS_MARKERS.find((candidate) => existsSync(join(directory, candidate.marker)))
  if (found) return {type: found.type, store: AbsolutePath.make(join(directory, found.marker))}
  const parent = dirname(directory)
  if (parent === directory) return undefined
  return detectVcs(parent)
}

function locationLayer(cwd: string) {
  const info = Schema.decodeSync(Location.Info)({directory: cwd, project: {id: cwd, directory: cwd, canonical: cwd}})
  return Layer.succeed(Location.Service, Location.Service.of({...info, vcs: detectVcs(cwd)}))
}

function machineRoots(home: string, fallback: string) {
  return provideGlobalRoots(home).pipe(
    Layer.catchCause((cause) =>
      Layer.unwrap(
        Effect.logError("[core] the plugin host's folders could not be made, using the fallback folder").pipe(
          Effect.annotateLogs({home, fallback, cause: Cause.pretty(cause)}),
          Effect.as(provideGlobalRoots(fallback)),
        ),
      ),
    ),
    Layer.provide(NodeFileSystem.layer),
  )
}

function pluginHostLayer(input: PluginRuntimeInput) {
  return Layer.mergeAll(
    Plugin.layer,
    SdkPlugins.layer,
    InstancePlugins.bound(
      input.plugins.map((plugin) => PluginPromise.fromPromise(plugin)),
      {
        post: input.post,
      },
    ),
    PluginUpdate.layer,
    ConfigPluginSource.layer,
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Tool.layer,
        Permission.layer,
        SkillInstructions.layer,
        SessionProjector.layer,
        provideInstructionEntries,
      ),
    ),
    Layer.provideMerge(Layer.mergeAll(Agent.layer, PermissionSaved.layer, permissionSessions(input.db), Skill.layer)),
    Layer.provideMerge(Layer.mergeAll(PluginHooks.layer, Image.layer)),
    Layer.provideMerge(
      Layer.mergeAll(
        Rpc.layer,
        KV.layer,
        EventFeed.layer,
        FileSystem.layer.pipe(
          Layer.provide(FileSystemSearch.defaultLayer),
          Layer.provide(Ripgrep.layer),
          Layer.provide(RipgrepBinary.layer),
        ),
        publishBundlerDiagnostics(input.bundler),
      ),
    ),
    Layer.provideMerge(Bus.configured()),
    Layer.provideMerge(
      Layer.mergeAll(
        locationLayer(input.cwd),
        provideApp(),
        provideServersSource({home: input.home, engineId: input.engineId}),
        provideBundlerSource(input.bundler),
        provideEditorSource(input.openInEditor),
        provideConfiguredPolicies(input.config.policies),
        provideConfiguredPermissions(input.config.permissions),
        Layer.succeed(ConfigPluginSource.ConfiguredPlugins, input.config.plugins),
        provideHarnessModels(input.harness, input.signal),
        provideSessions(input.sessions),
        Watcher.layer().pipe(Layer.provide(Watcher.nativeLayer)),
        Npm.layer.pipe(Layer.provide(EffectFlock.layer)),
      ),
    ),
    Layer.provideMerge(FSUtil.layer),
    Layer.provideMerge(
      Layer.mergeAll(
        Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, input.db.$client)),
        machineRoots(input.home, input.fallbackRoots),
        NodeFileSystem.layer,
        NodeChildProcessSpawner.layer.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
        FetchHttpClient.layer,
        ConfigProvider.layer(input.configProvider),
      ),
    ),
  )
}

type SessionPrompt = PluginHooks.Domains['session']['prompt']
type RequestHook = Parameters<typeof createChatPlane>[0]['context']
type SessionRequest = Parameters<RequestHook>[1]

function modelRef(model: SessionRequest['model']): Model.Ref {
  return {
    id: Model.Id.make(model.id),
    providerId: Model.Ref.fields.providerId.make(model.providerId),
    ...(model.variant === undefined ? {} : {variant: Model.VariantId.make(model.variant)}),
  }
}

export type PluginRuntime = {
  runtime: PluginHostRuntime
  supervise: () => Promise<void>
  awaitActivation: () => Promise<void>
  prompt: (event: SessionPrompt, signal: AbortSignal) => Promise<SessionPrompt>
  promptHooked: () => Promise<boolean>
  context: RequestHook
  closeRpc: () => Promise<void>
  closePlugins: () => Promise<void>
  closePermissions: () => Promise<void>
}

export function makePluginRuntime(input: PluginRuntimeInput): PluginRuntime {
  const runtime = ManagedRuntime.make(pluginHostLayer(input))
  const supervised = Scope.forkUnsafe(runtime.scope, 'sequential')
  return {
    runtime,
    supervise: () => runtime.runPromise(Layer.buildWithScope(PluginSupervisor.layer, supervised).pipe(Effect.asVoid)),
    awaitActivation: () => runtime.runPromise(Plugin.awaitActivation),
    prompt: (event, signal) =>
      runtime.runPromise(
        Plugin.awaitActivation.pipe(
          Effect.andThen(PluginHooks.Service.use((hooks) => hooks.trigger('session', 'prompt', event))),
        ),
        {signal},
      ),
    promptHooked: () =>
      runtime.runPromise(
        Plugin.awaitActivation.pipe(Effect.andThen(PluginHooks.Service.use((hooks) => hooks.has('session', 'prompt')))),
      ),
    context: (name, request, signal) =>
      runtime.runPromise(
        Plugin.awaitActivation.pipe(
          Effect.andThen(Session.Service.use((sessions) => sessions.get(request.sessionId))),
          Effect.flatMap((session) =>
            PluginHooks.Service.use((hooks) =>
              hooks.trigger('session', name, {
                ...request,
                sessionId: session.id,
                model: modelRef(request.model),
                agent: Agent.Id.make(session.agent ?? Agent.defaultId),
              }),
            ),
          ),
        ),
        {signal},
      ),
    closeRpc: () => runtime.runPromise(Rpc.Service.use((rpc) => rpc.close)),
    closePlugins: () => Effect.runPromise(Scope.close(supervised, Exit.void)),
    closePermissions: () => runtime.runPromise(Permission.Service.use((permission) => permission.close)),
  }
}
