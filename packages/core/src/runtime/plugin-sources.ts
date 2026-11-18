import type {ServerHarness, ServerSessions} from '@conciv/protocol/harness-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {ResolvedConcivConfig} from '../config.js'
import {join} from 'node:path'
import {App, ConfigAgentPlugin, ConfigPolicy, Global, ManagedPolicy, PluginHost} from '@conciv/plugin-host'
import {Effect, Layer, Schema} from 'effect'
import corePackage from '../../package.json' with {type: 'json'}

type HarnessSourceInput = {
  harness: (sessionId: SessionId) => ServerHarness
  sessions: Pick<ServerSessions, 'resumeToken' | 'recordToken'>
  tokenScopedBase: () => string | undefined
}

export function provideHarnessSource(input: HarnessSourceInput) {
  return Layer.succeed(
    PluginHost.HarnessSource,
    PluginHost.HarnessSource.of({
      get: input.harness,
      resumeToken: input.sessions.resumeToken,
      recordToken: input.sessions.recordToken,
      get mcpUrl() {
        const base = input.tokenScopedBase()
        return base === undefined ? undefined : `${base}/api/mcp`
      },
    }),
  )
}

export function provideBundlerSource(bundler: BundlerBridge | undefined) {
  return Layer.succeed(PluginHost.BundlerSource, bundler)
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
