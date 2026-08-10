import type {AnyExtension} from '@conciv/extension'
import type {HarnessCommand, HarnessModel} from '@conciv/protocol/harness-types'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

export type EmbedKit = CoreKit

export async function bootEmbedKit(
  opts: {text?: string; extensions?: AnyExtension[]; models?: HarnessModel[]; commands?: HarnessCommand[]} = {},
): Promise<EmbedKit> {
  const kit = await bootCoreKit({
    id: 'fake-embed',
    text: opts.text,
    extensions: opts.extensions,
    models: opts.models,
    commands: opts.commands,
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
