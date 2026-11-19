import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '@conciv/core/start'
import type {AnyExtension} from '@conciv/extension'
import type {HarnessAdapter} from '@conciv/harness'

export type BootedServer = {
  apiBase: string
  origin: string
  stop: () => Promise<void>
}

const removeRoot = (root: string): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10})

export async function bootExtensionServer(
  _extension: AnyExtension,
  opts: {harness?: HarnessAdapter} = {},
): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'conciv-testkit-'))
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false, harness: opts.harness?.id},
    root,
    harness: opts.harness,
    launchEditor: () => {},
    print: () => {},
  }).catch(async (error: unknown) => {
    await removeRoot(root)
    throw error
  })
  const origin = `http://127.0.0.1:${engine.port}`
  return {
    apiBase: `${origin}/t/${engine.agentToken}`,
    origin,
    stop: async () => {
      try {
        await engine.stop()
      } finally {
        await removeRoot(root)
      }
    },
  }
}
