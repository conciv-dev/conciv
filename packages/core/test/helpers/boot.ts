import {chmodSync, mkdirSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension} from '@conciv/extension'
import {createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import {requireClaude} from './adapters.js'

const require = createRequire(import.meta.url)
const tsxEntry = fileURLToPath(pathToFileURL(require.resolve('tsx')))
const fakeClaudePath = fileURLToPath(new URL('../fixtures/fake-claude.ts', import.meta.url))

export type BootOverrides = {
  fakeClaude?: {env?: (sessionId?: string) => NodeJS.ProcessEnv}
  cwd?: string
  claudeHome?: string
  extensions?: AnyExtension[]
  extensionConfig?: Record<string, unknown>
  openInEditor?: (file: string, line?: number) => void
  bridge?: BundlerBridge
}

function fakeClaudeBinDir(stateRoot: string): string {
  const binDir = join(stateRoot, 'fake-bin')
  mkdirSync(binDir, {recursive: true})
  const shim = join(binDir, 'claude')
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" --import "${tsxEntry}" "${fakeClaudePath}" "$@"\n`)
  chmodSync(shim, 0o755)
  return binDir
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
    const {app, disposers} = await makeApp({
      cfg,
      cwd: overrides.cwd ?? env.cwd,
      openInEditor: overrides.openInEditor ?? (() => {}),
      harness: env.harness,
      harnessEnv,
      claudeHome: overrides.claudeHome,
      extensions: overrides.extensions,
      extensionConfig: overrides.extensionConfig,
      bridge: overrides.bridge,
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }
}
