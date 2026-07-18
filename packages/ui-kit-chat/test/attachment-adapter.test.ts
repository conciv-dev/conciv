import {describe, expect, it} from 'vitest'
import {
  composeAttachmentAdapters,
  createSimpleImageAttachmentAdapter,
  createTextAttachmentAdapter,
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

  it('marks oversized images incomplete on add and refuses to send them', async () => {
    const adapter = createSimpleImageAttachmentAdapter()
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.png', {type: 'image/png'})
    const pending = await adapter.add({file: big})
    if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')
    expect(pending.status).toMatchObject({type: 'incomplete', reason: 'error'})
    await expect(adapter.send(pending)).rejects.toThrow('20MB')
  })

  it('marks svg images incomplete on add and refuses to send them', async () => {
    const adapter = createSimpleImageAttachmentAdapter()
    const svg = new File(['<svg/>'], 'icon.svg', {type: 'image/svg+xml'})
    const pending = await adapter.add({file: svg})
    if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')
    expect(pending.status).toMatchObject({type: 'incomplete', reason: 'error'})
    await expect(adapter.send(pending)).rejects.toThrow('SVG')
  })

  it('uses application/octet-stream when the browser omits a MIME type', async () => {
    const source = await fileToDataSource(new File(['hello'], 'unknown'))
    expect(source).toEqual({type: 'data', value: 'aGVsbG8=', mimeType: 'application/octet-stream'})
  })

  it('infers an image MIME type from the extension when the browser omits it', async () => {
    const source = await fileToDataSource(new File(['hello'], 'photo.PNG'))
    expect(source).toEqual({type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'})
  })

  it('converts text files to a named text content part on send', async () => {
    const adapter = createTextAttachmentAdapter()
    const file = new File(['line one\nline two'], 'recording.txt', {type: 'text/plain'})
    const pending = await adapter.add({file})
    if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')
    expect(pending).toMatchObject({
      type: 'document',
      name: 'recording.txt',
      contentType: 'text/plain',
      status: {type: 'requires-action', reason: 'composer-send'},
    })
    const complete = await adapter.send(pending)
    expect(complete.status).toEqual({type: 'complete'})
    expect(complete.content).toEqual([{type: 'text', content: 'Attachment recording.txt:\nline one\nline two'}])
  })

  it('marks oversized text files incomplete on add', async () => {
    const adapter = createTextAttachmentAdapter()
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'huge.txt', {type: 'text/plain'})
    const pending = await adapter.add({file: big})
    if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')
    expect(pending.status).toMatchObject({type: 'incomplete', reason: 'error'})
  })

  it('composes adapters and routes add/send/remove to the adapter matching the file type', async () => {
    const composed = composeAttachmentAdapters([createSimpleImageAttachmentAdapter(), createTextAttachmentAdapter()])
    expect(composed.accept).toBe('image/*,text/plain,.txt,.md,.log')

    const textPending = await composed.add({file: new File(['hi'], 'notes.txt', {type: 'text/plain'})})
    if (Symbol.asyncIterator in textPending) throw new Error('Expected a promise attachment')
    expect(textPending.type).toBe('document')
    const textComplete = await composed.send(textPending)
    expect(textComplete.content).toEqual([{type: 'text', content: 'Attachment notes.txt:\nhi'}])

    const imagePending = await composed.add({file: new File([new Uint8Array([1])], 'dot.png', {type: 'image/png'})})
    if (Symbol.asyncIterator in imagePending) throw new Error('Expected a promise attachment')
    expect(imagePending.type).toBe('image')
    const imageComplete = await composed.send(imagePending)
    expect(imageComplete.content[0]).toMatchObject({type: 'image'})

    await expect(composed.remove(textPending)).resolves.toBeUndefined()
  })

  it('rejects files no composed adapter accepts', async () => {
    const composed = composeAttachmentAdapters([createTextAttachmentAdapter()])
    await expect(async () => composed.add({file: new File(['x'], 'movie.mp4', {type: 'video/mp4'})})).rejects.toThrow(
      'No attachment adapter accepts movie.mp4',
    )
  })
})
