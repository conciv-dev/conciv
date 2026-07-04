import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '@conciv/core/engine'
import type {AnyExtension} from '@conciv/extension'

export type BootedServer = {
  apiBase: string
  extensionContexts: Record<string, unknown>
  stop: () => Promise<void>
}

export async function bootExtensionServer(extension: AnyExtension): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'conciv-testkit-'))
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false},
    root,
    extensions: [extension],
    launchEditor: () => {},
  })
  return {
    apiBase: `http://127.0.0.1:${engine.port}`,
    extensionContexts: engine.extensionContexts,
    stop: () => engine.stop(),
  }
}
