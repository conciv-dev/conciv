import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {ResolvedConcivConfig} from '../config.js'
import {join} from 'node:path'
import * as Bundler from '@conciv/plugin/schema/bundler'
import {App, Bus, ConfigAgentPlugin, ConfigPolicy, Global, ManagedPolicy, PluginHost} from '@conciv/plugin-host'
import {Effect, Layer, Queue, Schema, Stream} from 'effect'
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

export function publishBundlerDiagnostics(bundler: Bundler.BundlerBridge | undefined) {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const subscribe = bundler?.subscribe?.bind(bundler)
      if (subscribe === undefined) return
      const bus = yield* Bus.Service
      yield* diagnostics(subscribe).pipe(
        Stream.runForEach((diagnostic) => bus.publish(Bundler.Event.Diagnostic, {diagnostic})),
        Effect.forkScoped,
      )
    }),
  )
}

export function provideEditorSource(openInEditor: (file: string, line?: number, column?: number) => void) {
  return Layer.succeed(PluginHost.EditorSource, openInEditor)
}

export function provideExtensionSlugs(slugs: ReadonlyArray<string>) {
  return Layer.succeed(PluginHost.ExtensionSlugs, slugs)
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

export function provideGlobalRoots(home: string) {
  return Global.layerWith({cache: join(home, 'cache'), config: home, state: join(home, 'state')})
}
