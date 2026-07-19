import {describe, expect, it} from 'vitest'
import {defineExtension} from '../src/define-extension.js'
import {defineAttachment} from '../src/define-attachment.js'
import {collectAttachmentCards} from '../src/collect-client.js'

describe('collectAttachmentCards', () => {
  it('gathers registered cards keyed by mime, first-wins', () => {
    const CardA = () => null
    const CardB = () => null
    const first = defineAttachment({mime: 'application/x-test'})
    first.card(CardA)
    const duplicate = defineAttachment({mime: 'application/x-test'})
    duplicate.card(CardB)
    const cards = collectAttachmentCards([
      defineExtension({name: 'a', attachments: [first]}),
      defineExtension({name: 'b', attachments: [duplicate]}),
    ])
    expect(cards).toEqual([{mime: 'application/x-test', render: CardA}])
  })

  it('ignores attachments with no card', () => {
    const bare = defineAttachment({mime: 'application/x-noop'})
    expect(collectAttachmentCards([defineExtension({name: 'c', attachments: [bare]})])).toEqual([])
  })
})
