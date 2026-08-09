import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '@conciv/core/start'
import type {AnyExtension} from '@conciv/extension'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {deadline, TESTKIT_DEADLINE_MS} from '@conciv/harness-testkit/deadline'

export type BootedServer = {
  apiBase: string
  extensionContexts: Record<string, unknown>
  stop: () => Promise<void>
}

export async function bootExtensionServer(
  extension: AnyExtension,
  opts: {harness?: HarnessAdapter} = {},
): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'conciv-testkit-'))
  const engine = await deadline(
    `testkit engine start(${extension.name})`,
    TESTKIT_DEADLINE_MS,
    start({
      options: {stateRoot: root, systemPrompt: false, harness: opts.harness?.id},
      root,
      harness: opts.harness,
      extensions: [extension],
      launchEditor: () => {},
    }),
  )
  return {
    apiBase: `http://127.0.0.1:${engine.port}`,
    extensionContexts: engine.extensionContexts,
    stop: () => deadline(`testkit engine stop(${extension.name})`, TESTKIT_DEADLINE_MS, engine.stop()),
  }
}
