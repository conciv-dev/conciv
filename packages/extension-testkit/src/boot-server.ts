import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {start} from '@conciv/core/start'
import type {AnyExtension} from '@conciv/extension'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {createRecordingTerminalOpener, type RecordingTerminalOpener} from '@conciv/harness-testkit'

export type BootedServer = {
  apiBase: string
  extensionContexts: Record<string, unknown>
  terminal: RecordingTerminalOpener
  stop: () => Promise<void>
}

export async function bootExtensionServer(
  extension: AnyExtension,
  opts: {harness?: HarnessAdapter} = {},
): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'conciv-testkit-'))
  const terminal = createRecordingTerminalOpener()
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false, harness: opts.harness?.id},
    root,
    harness: opts.harness,
    extensions: [extension],
    launchEditor: () => {},
    openTerminal: terminal.open,
  })
  return {
    apiBase: `http://127.0.0.1:${engine.port}`,
    extensionContexts: engine.extensionContexts,
    terminal,
    stop: () => engine.stop(),
  }
}
