import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {AnyExtension} from '@conciv/extension'
import {createTestkit, type BootApp, type BootEnv, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import {requireClaude} from './adapters.js'

export type SpawnHarness = BootEnv['spawnHarness']

export type BootOverrides = {
  spawn?: BootEnv['spawnHarness']
  cwd?: string
  claudeHome?: string
  extensions?: AnyExtension[]
  extensionConfig?: Record<string, unknown>
}

export function bootKit(overrides: BootOverrides = {}, harness: HarnessAdapter = requireClaude()): Promise<Kit> {
  return createTestkit(harness, bootCoreApp(overrides)).setup()
}

export function bootCoreApp(overrides: BootOverrides = {}): BootApp {
  return async (env) => {
    const cfg: ResolvedConcivConfig = {
      enabled: true,
      widgetUrl: undefined,
      stateRoot: env.stateRoot,
      harness: env.harness.id,
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    }
    const {app, disposers} = await makeApp({
      cfg,
      cwd: overrides.cwd ?? env.cwd,
      openInEditor: () => {},
      spawnHarness: overrides.spawn ?? env.spawnHarness,
      harness: env.harness,
      claudeHome: overrides.claudeHome,
      extensions: overrides.extensions,
      extensionConfig: overrides.extensionConfig,
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }
}
