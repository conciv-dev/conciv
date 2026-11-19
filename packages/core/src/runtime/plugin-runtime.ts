import type {HarnessAdapter} from '@conciv/harness'
import type {Plugin as PluginDefinition} from '@conciv/plugin'
import type {Plugin as EffectPlugin} from '@conciv/plugin/effect/plugin'
import {Model} from '@conciv/plugin/schema/model'
import type {createChatPlane} from '@conciv/chat'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import type {ConcivDb} from '@conciv/db'
import {NodeFileSystem} from '@effect/platform-node'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {
  Agent,
  Bus,
  ConfigPluginSource,
  Database,
  EffectFlock,
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
  Rpc,
  SdkPlugins,
  Session,
  SessionProjector,
  Skill,
  SkillInstructions,
  Tool,
  Watcher,
} from '@conciv/plugin-host'
import {Cause, Effect, Exit, Layer, ManagedRuntime, Schema, Scope} from 'effect'
import type {PluginHost} from '../api/rpc/mount.js'
import type {ResolvedConcivConfig} from '../config.js'
import {logError} from '../lib/debug.js'
import {EventFeed} from '../event-feed.js'
import {provideHarnessModels} from './harness-models.js'
import {provideInstructionEntries} from './instruction-entries.js'
import {permissionSessions} from './permission-cards.js'
import {
  provideApp,
  provideBundlerSource,
  provideConfiguredPermissions,
  provideConfiguredPolicies,
  provideEditorSource,
  provideExtensionSlugs,
  provideGlobalRoots,
  publishBundlerDiagnostics,
} from './plugin-sources.js'
import {provideSessions} from './plugin-sessions.js'
import {provideServersSource} from './servers-source.js'

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
  extensionSlugs: ReadonlyArray<string>
  sessions: Parameters<typeof provideSessions>[0]
}

function locationLayer(cwd: string) {
  return Layer.succeed(
    Location.Service,
    Location.Service.of(
      Schema.decodeSync(Location.Info)({directory: cwd, project: {id: cwd, directory: cwd, canonical: cwd}}),
    ),
  )
}

function machineRoots(home: string, fallback: string) {
  return provideGlobalRoots(home).pipe(
    Layer.catchCause((cause) => {
      logError(
        `[core] the plugin host's folders under ${home} could not be made, using ${fallback}: ${Cause.pretty(cause)}`,
      )
      return provideGlobalRoots(fallback)
    }),
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
    Layer.provideMerge(Layer.mergeAll(Rpc.layer, KV.layer, EventFeed.layer, publishBundlerDiagnostics(input.bundler))),
    Layer.provideMerge(Bus.configured()),
    Layer.provideMerge(
      Layer.mergeAll(
        locationLayer(input.cwd),
        provideApp(),
        provideServersSource({home: input.home, engineId: input.engineId}),
        provideBundlerSource(input.bundler),
        provideEditorSource(input.openInEditor),
        provideExtensionSlugs(input.extensionSlugs),
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
  runtime: PluginHost
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
