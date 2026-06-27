import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '@mandarax/core/engine'
import type {AnyExtension} from '@mandarax/extension'

export type BootedServer = {apiBase: string; stop: () => Promise<void>}

export async function bootExtensionServer(extension: AnyExtension): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'mandarax-testkit-'))
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false},
    root,
    extensions: [extension],
    launchEditor: () => {},
  })
  return {apiBase: `http://127.0.0.1:${engine.port}`, stop: () => engine.stop()}
}
