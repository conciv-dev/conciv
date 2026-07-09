import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {makeApp, type AppType} from '../app.js'

export type TestApp = {app: AppType; stateRoot: string; dispose: () => Promise<void>}

export async function makeTestApp(): Promise<TestApp> {
  const harness = getHarness('claude')
  if (!harness) throw new Error('claude harness missing')
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-rpc-app-'))
  const {app, disposers} = await makeApp({
    cfg: {
      enabled: true,
      widgetUrl: undefined,
      stateRoot,
      harness: 'claude',
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    },
    cwd: stateRoot,
    openInEditor: () => {},
    harness,
  })
  return {
    app,
    stateRoot,
    dispose: async () => {
      await Promise.all(disposers.map((dispose) => dispose()))
    },
  }
}
