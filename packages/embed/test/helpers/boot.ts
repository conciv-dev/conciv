import type {AnyExtension} from '@conciv/extension'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

export type EmbedKit = CoreKit

export async function bootEmbedKit(opts: {text?: string; extensions?: AnyExtension[]} = {}): Promise<EmbedKit> {
  return bootCoreKit({id: 'fake-embed', text: opts.text, extensions: opts.extensions})
}
