import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {AnyExtension} from '@conciv/extension'
import {createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import {markerWriter} from '../../src/store/markers.js'
import {requireClaude} from './adapters.js'
import {fakeClaudeBinDir, startTestStore} from './state-plane.js'

export type BootOverrides = {
  fakeClaude?: {env?: (sessionId?: string) => NodeJS.ProcessEnv}
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
    const fake = overrides.fakeClaude
    const binDir = fake ? fakeClaudeBinDir(env.stateRoot) : null
    const harnessEnv = binDir
      ? (sessionId?: string): NodeJS.ProcessEnv => ({
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          ...fake?.env?.(sessionId),
        })
      : undefined
    const plane = await startTestStore()
    const {app, disposers} = await makeApp({
      cfg,
      cwd: overrides.cwd ?? env.cwd,
      openInEditor: () => {},
      harness: env.harness,
      harnessEnv,
      claudeHome: overrides.claudeHome,
      extensions: overrides.extensions,
      extensionConfig: overrides.extensionConfig,
      store: plane.store,
      markers: markerWriter(plane.records),
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
        await plane.stop()
      },
    }
  }
}
