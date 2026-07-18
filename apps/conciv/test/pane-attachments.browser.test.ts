import {describe, expect, it} from 'vitest'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {paneAttachments} from '../src/chat/pane-attachments.js'

function fixtureExtension() {
  const attachment = defineAttachment({mime: 'application/x-fixture'})
  attachment.card(() => null)
  return defineExtension({name: 'fixture', attachments: [attachment]})
}

describe('paneAttachments', () => {
  it('collects cards and accepts files of a registered mime', async () => {
    const {cards, adapter} = paneAttachments([fixtureExtension()], false)
    expect(cards.map((entry) => entry.mime)).toEqual(['application/x-fixture'])
    const pending = await adapter.add({file: new File(['{"x":1}'], 'fixture.bin', {type: 'application/x-fixture'})})
    if (Symbol.asyncIterator in pending) throw new Error('expected a promise-based adapter')
    expect(pending.contentType).toBe('application/x-fixture')
    expect(pending.type).toBe('document')
  })

  it('still accepts text files and gates images on harness support', () => {
    expect(paneAttachments([], false).adapter.accept).not.toContain('image/*')
    expect(paneAttachments([], 'native').adapter.accept).toContain('image/*')
    expect(paneAttachments([], 'fileRef').adapter.accept).toContain('text/plain')
  })
})
