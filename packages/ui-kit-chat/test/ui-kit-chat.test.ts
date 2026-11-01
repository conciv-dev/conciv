import {describe, expect, it} from 'vitest'
import {MAX_ATTACHMENT_RAW_BYTES} from '@conciv/protocol/chat-types'
import type {RunLifecycle} from '@conciv/protocol/chat-event-types'
import type {ChatPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  composeAttachmentAdapters,
  createSimpleImageAttachmentAdapter,
  createTextAttachmentAdapter,
  fileMatchesAccept,
  fileToDataSource,
} from '../src/primitives/attachment/attachment-adapter.js'
import {formatElapsed, runClock, type RunClockSource} from '../src/store/run-clock.js'
import {coalesceTurns, diffTurns} from '../src/store/grouping.js'

describe('attachment adapter', () => {
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
      if (Symbol.asyncIterator in first || Symbol.asyncIterator in second)
        throw new Error('Expected promise attachments')
      expect(first.id).not.toBe(second.id)
    })

    it('marks oversized images incomplete on add and refuses to send them', async () => {
      const adapter = createSimpleImageAttachmentAdapter()
      const big = new File([new Uint8Array(MAX_ATTACHMENT_RAW_BYTES + 1)], 'huge.png', {type: 'image/png'})
      const pending = await adapter.add({file: big})
      if (Symbol.asyncIterator in pending) throw new Error('Expected a promise attachment')
      expect(pending.status).toMatchObject({type: 'incomplete', reason: 'error'})
      await expect(adapter.send(pending)).rejects.toThrow('MB image limit')
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
})

describe('run clock', () => {
  function lifecycle(overrides: Partial<RunLifecycle> = {}): RunLifecycle {
    return {
      runId: 'run-1',
      phase: 'running',
      startedAt: 1_000,
      finishedAt: null,
      serverNow: 1_000,
      error: null,
      ...overrides,
    }
  }

  function source(overrides: Partial<RunClockSource> = {}): RunClockSource {
    return {lifecycle: lifecycle(), receivedAt: 500_000, ...overrides}
  }

  describe('formatElapsed', () => {
    it('formats sub-hour durations as mm:ss', () => {
      expect(formatElapsed(84_000)).toBe('01:24')
    })

    it('formats zero as 00:00', () => {
      expect(formatElapsed(0)).toBe('00:00')
    })

    it('formats hour-scale durations as h:mm:ss', () => {
      expect(formatElapsed(3_661_000)).toBe('1:01:01')
    })
  })

  describe('runClock', () => {
    it('reports no elapsed time before any run has been observed', () => {
      expect(runClock(null, 500_000)).toEqual({elapsedMs: null, frozen: false})
    })

    it('ticks forward from the moment the lifecycle was received', () => {
      const state = runClock(source(), 502_500)
      expect(state).toEqual({elapsedMs: 2_500, frozen: false})
    })

    it('freezes at the run record duration once the run has finished', () => {
      const finished = source({lifecycle: lifecycle({phase: 'completed', finishedAt: 4_000, serverNow: 4_000})})
      expect(runClock(finished, 500_000)).toEqual({elapsedMs: 3_000, frozen: true})
      expect(runClock(finished, 900_000)).toEqual({elapsedMs: 3_000, frozen: true})
    })

    it('freezes at the run record duration for a run that was stopped', () => {
      const aborted = source({lifecycle: lifecycle({phase: 'aborted', finishedAt: 9_500, serverNow: 9_500})})
      expect(runClock(aborted, 700_000)).toEqual({elapsedMs: 8_500, frozen: true})
    })

    it('keeps counting from the server-side start after a reload re-delivers the snapshot', () => {
      const reloaded = source({lifecycle: lifecycle({serverNow: 31_000}), receivedAt: 500_000})
      expect(runClock(reloaded, 502_000)).toEqual({elapsedMs: 32_000, frozen: false})
    })

    it('stays continuous when a re-subscribe re-delivers the snapshot and the run record', () => {
      const live = runClock({lifecycle: lifecycle({serverNow: 12_000}), receivedAt: 500_000}, 505_000)
      expect(live).toEqual({elapsedMs: 16_000, frozen: false})
      const afterResubscribe = runClock({lifecycle: lifecycle({serverNow: 17_000}), receivedAt: 505_000}, 505_000)
      expect(afterResubscribe).toEqual({elapsedMs: 16_000, frozen: false})
    })

    it('never reports a negative elapsed time when the host clock steps backwards', () => {
      expect(runClock(source(), 499_000)).toEqual({elapsedMs: 0, frozen: false})
    })
  })
})

describe('grouping diff', () => {
  function user(id: string, text: string): ChatMessage {
    return {id, role: 'user', parts: [{type: 'text', content: text}]}
  }

  function assistant(id: string, parts: ChatPart[]): ChatMessage {
    return {id, role: 'assistant', parts}
  }

  function text(content: string): ChatPart {
    return {type: 'text', content}
  }

  const conversation = (): ChatMessage[] => [
    user('u1', 'hello'),
    assistant('a1', [{type: 'thinking', content: 'hmm'}]),
    assistant('a2', [text('answer one')]),
    user('u2', 'more'),
    assistant('a3', [text('answer two')]),
  ]

  describe('diffTurns equivalence', () => {
    const cases: Array<[string, ChatMessage[]]> = [
      ['empty', []],
      ['single user', [user('u1', 'hi')]],
      ['single assistant', [assistant('a1', [text('yo')])]],
      ['merged assistant run', conversation()],
      ['leading assistant', [assistant('a1', [text('a')]), user('u1', 'b'), assistant('a2', [text('c')])]],
      [
        'system interleaved',
        [{id: 's1', role: 'system', parts: [text('sys')]}, user('u1', 'q'), assistant('a1', [text('r')])],
      ],
    ]

    for (const [name, messages] of cases) {
      it(`matches coalesceTurns for ${name}`, () => {
        expect(diffTurns([], [], messages)).toEqual(coalesceTurns(messages))
      })
    }

    it('matches coalesceTurns when diffing from any previous state', () => {
      const previousMessages = conversation()
      const previousTurns = diffTurns([], [], previousMessages)
      const next = [...conversation(), assistant('a4', [text('appended')])]
      expect(diffTurns(previousTurns, previousMessages, next)).toEqual(coalesceTurns(next))
    })
  })
})
