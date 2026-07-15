import {describe, expect, it} from 'vitest'
import {
  createSimpleImageAttachmentAdapter,
  fileMatchesAccept,
  fileToDataSource,
} from '../src/primitives/attachment/attachment-adapter.js'

describe('attachment adapters', () => {
  it('matches MIME types and extensions using file input accept semantics', () => {
    expect(fileMatchesAccept({name: 'photo.PNG', type: 'image/png'}, 'image/*')).toBe(true)
    expect(fileMatchesAccept({name: 'photo.PNG', type: ''}, 'image/*')).toBe(true)
    expect(fileMatchesAccept({name: 'notes.md', type: ''}, '.md,text/plain')).toBe(true)
    expect(fileMatchesAccept({name: 'notes.pdf', type: 'application/pdf'}, 'image/*')).toBe(false)
  })

  it('converts image bytes to the TanStack AI data source shape on send', async () => {
    const adapter = createSimpleImageAttachmentAdapter()
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'pixel.png', {type: 'image/png'})
    const pending = await adapter.add({file})
    expect(Symbol.asyncIterator in pending).toBe(false)
    if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')

    expect(pending).toMatchObject({
      type: 'image',
      name: 'pixel.png',
      contentType: 'image/png',
      status: {type: 'requires-action', reason: 'composer-send'},
    })

    const complete = await adapter.send(pending)
    expect(complete).toMatchObject({
      id: pending.id,
      status: {type: 'complete'},
      content: [{type: 'image', source: {type: 'data', value: 'AAEC/w==', mimeType: 'image/png'}}],
    })
  })

  it('assigns distinct ids to files with the same name and size', async () => {
    const adapter = createSimpleImageAttachmentAdapter()
    const first = await adapter.add({file: new File(['a'], 'same.png', {type: 'image/png'})})
    const second = await adapter.add({file: new File(['b'], 'same.png', {type: 'image/png'})})
    if (Symbol.asyncIterator in first || Symbol.asyncIterator in second) throw new Error('Expected promise attachments')
    expect(first.id).not.toBe(second.id)
  })

  it('uses application/octet-stream when the browser omits a MIME type', async () => {
    const source = await fileToDataSource(new File(['hello'], 'unknown'))
    expect(source).toEqual({type: 'data', value: 'aGVsbG8=', mimeType: 'application/octet-stream'})
  })

  it('infers an image MIME type from the extension when the browser omits it', async () => {
    const source = await fileToDataSource(new File(['hello'], 'photo.PNG'))
    expect(source).toEqual({type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'})
  })
})
