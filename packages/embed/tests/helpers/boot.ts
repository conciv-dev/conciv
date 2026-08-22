import type {AnyExtension} from '@conciv/extension'
import type {HarnessCommand, HarnessModel, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

export type EmbedKit = CoreKit

export async function bootEmbedKit(
  opts: {
    text?: string
    extensions?: AnyExtension[]
    models?: HarnessModel[]
    commands?: HarnessCommand[]
    history?: HarnessSessionMeta[]
    globalStateDir?: string
  } = {},
): Promise<EmbedKit> {
  const kit = await bootCoreKit({
    id: 'fake-embed',
    text: opts.text,
    extensions: opts.extensions,
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
    globalStateDir: opts.globalStateDir,
  })
  return {
    ...kit,
    cleanup: async () => {
      try {
        await kit.cleanup()
      } catch (error) {
        console.error('[embed-testkit] kit cleanup failed:', error)
      }
    },
  }
}
