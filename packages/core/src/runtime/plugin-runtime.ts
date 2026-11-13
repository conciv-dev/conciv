import type {HarnessAdapter} from '@conciv/harness'
import type {Plugin as PluginDefinition} from '@conciv/plugin'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ConcivDb} from '@conciv/db'
import {NodeFileSystem} from '@effect/platform-node'
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
  PluginHooks,
  PluginPromise,
  PluginSupervisor,
  PluginUpdate,
  Rpc,
  SdkPlugins,
  SessionProjector,
  Skill,
  SkillInstructions,
  Tool,
  Watcher,
} from '@conciv/plugin-host'
import {Cause, Effect, Exit, Layer, ManagedRuntime, Schema, Scope} from 'effect'
import {once} from 'es-toolkit'
import type {PluginHost} from '../api/rpc/mount.js'
import type {ResolvedConcivConfig} from '../config.js'
import {logError} from '../lib/debug.js'
import {provideHarnessModels} from './harness-models.js'
import {provideInstructionEntries} from './instruction-entries.js'
import {permissionSessions} from './permission-cards.js'
import {
  provideApp,
  provideBundlerSource,
  provideConfiguredPolicies,
  provideExtensionSlugs,
  provideGlobalRoots,
  provideHarnessSource,
} from './plugin-sources.js'
import {provideSessions} from './plugin-sessions.js'
import {provideServersSource} from './servers-source.js'

export type PluginRuntimeInput = {
  db: ConcivDb
  databaseFile: string
  cwd: string
  home: string
  fallbackRoots: string
  engineId: string
  config: Pick<ResolvedConcivConfig, 'plugins' | 'policies'>
  plugins: readonly PluginDefinition.Plugin[]
  harness: HarnessAdapter
  harnessSource: Parameters<typeof provideHarnessSource>[0]
  bundler: BundlerBridge | undefined
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
    InstancePlugins.bound(input.plugins.map((plugin) => PluginPromise.fromPromise(plugin))),
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
    Layer.provideMerge(PluginHooks.layer),
    Layer.provideMerge(Layer.mergeAll(Rpc.layer, KV.layer)),
    Layer.provideMerge(Bus.configured()),
    Layer.provideMerge(
      Layer.mergeAll(
        locationLayer(input.cwd),
        provideApp(),
        provideServersSource({home: input.home, engineId: input.engineId}),
        provideHarnessSource(input.harnessSource),
        provideBundlerSource(input.bundler),
        provideExtensionSlugs(input.extensionSlugs),
        provideConfiguredPolicies(input.config.policies),
        Layer.succeed(ConfigPluginSource.ConfiguredPlugins, input.config.plugins),
        provideHarnessModels(input.harness),
        provideSessions(input.sessions),
        Watcher.layer().pipe(Layer.provide(Watcher.nativeLayer)),
        Npm.layer.pipe(Layer.provide(EffectFlock.layer)),
      ),
    ),
    Layer.provideMerge(FSUtil.layer),
    Layer.provideMerge(
      Layer.mergeAll(
        Database.layer({path: input.databaseFile}),
        machineRoots(input.home, input.fallbackRoots),
        NodeFileSystem.layer,
      ),
    ),
  )
}

export type PluginRuntime = {
  runtime: PluginHost
  startPlugins: () => Promise<void>
  closeRpc: () => Promise<void>
  closePlugins: () => Promise<void>
  closePermissions: () => Promise<void>
}

export function makePluginRuntime(input: PluginRuntimeInput): PluginRuntime {
  const runtime = ManagedRuntime.make(pluginHostLayer(input))
  const supervised = Scope.forkUnsafe(runtime.scope, 'sequential')
  return {
    runtime,
    startPlugins: once(() =>
      runtime.runPromise(
        Layer.buildWithScope(PluginSupervisor.layer, supervised).pipe(Effect.andThen(Plugin.awaitActivation)),
      ),
    ),
    closeRpc: () => runtime.runPromise(Rpc.Service.use((rpc) => rpc.close)),
    closePlugins: () => Effect.runPromise(Scope.close(supervised, Exit.void)),
    closePermissions: () => runtime.runPromise(Permission.Service.use((permission) => permission.close)),
  }
}
