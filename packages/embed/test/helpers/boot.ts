import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

export type EmbedKit = CoreKit

export async function bootEmbedKit(opts: {text?: string} = {}): Promise<EmbedKit> {
  return bootCoreKit({id: 'fake-embed', text: opts.text})
}
