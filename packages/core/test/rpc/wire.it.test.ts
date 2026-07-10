import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
import {CONCIV_UI_EVENT} from '@conciv/protocol/ui-types'
import {CONCIV_TOOL_DURATION_EVENT} from '@conciv/protocol/tool-timing'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

type WireContext = {kit: Kit; harness: TestHarness}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootWire(overrides: Parameters<typeof bootKit>[0] = {}): Promise<WireContext> {
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit(overrides, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness}
}

describe('rpc over the wire (real app, real http, typed client)', () => {
  it('send starts a turn; attach replays snapshot then streams to RUN_FINISHED', async () => {
    const {kit} = await bootWire()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({sessionId, text: 'hello'})
    const events = await stream.done({hangGuardMs: 10_000})
    const types = events.all.map((chunk) => chunk.type)
    expect(types[0]).toBe(EventType.MESSAGES_SNAPSHOT)
    expect(types).toContain(EventType.RUN_FINISHED)
  })

  it('attach mid-turn replays RUN_STARTED after the snapshot so clients derive generating', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    harness.__scripted.hold()
    await kit.rpc.chat.send({sessionId, text: 'hello'})
    const late = await kit.attach(sessionId)
    harness.__scripted.release()
    const events = await late.done({hangGuardMs: 10_000})
    const types = events.all.map((chunk) => chunk.type)
    expect(types[0]).toBe(EventType.MESSAGES_SNAPSHOT)
    expect(types).toContain(EventType.RUN_STARTED)
  })

  it('send reports typed BUSY while a turn is generating', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    harness.__scripted.hold()
    await kit.rpc.chat.send({sessionId, text: 'first'})
    await expect(kit.rpc.chat.send({sessionId, text: 'second'})).rejects.toMatchObject({code: 'BUSY'})
    harness.__scripted.release()
    await stream.done({hangGuardMs: 10_000})
  })

  it('send consumes the server-side draft: grabs prefix the turn, row cleared', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.drafts.set({
      sessionId,
      text: 'draft-text',
      selectionStart: 0,
      selectionEnd: 0,
      grabs: ['<div id="grabbed"/>'],
    })
    await kit.rpc.chat.send({sessionId, text: 'about the grabbed element'})
    await stream.done({hangGuardMs: 10_000})
    const lastTurn = harness.__turnMessages.at(-1)
    if (!lastTurn) throw new Error('adapter saw no turn')
    const lastUser = lastTurn.findLast((message) => message.role === 'user')
    const text = typeof lastUser?.content === 'string' ? lastUser.content : ''
    expect(text.startsWith('<div id="grabbed"/>\n')).toBe(true)
    expect(text).toContain('about the grabbed element')
    expect(await kit.rpc.drafts.get({sessionId})).toBeNull()
  })

  it('send rebuilds history from the transcript when the harness cannot resume (C3)', async () => {
    const claudeHome = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-home-')))
    const harness = createTestHarness(requireClaude())
    const noResume: TestHarness = Object.assign({}, harness, {
      capabilities: Object.assign({}, harness.capabilities, {resume: false as const}),
    })
    const kit = await bootKit({claudeHome}, noResume)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const first = await kit.attach(sessionId)
    await kit.rpc.chat.send({sessionId, text: 'first question'})
    await first.done({hangGuardMs: 10_000})
    const history = noResume.history
    if (!history) throw new Error('harness has no history support')
    const transcript = history.transcriptPath(kit.stateRoot, `fake-${sessionId}`, claudeHome)
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [
        JSON.stringify({type: 'user', message: {content: 'first question'}}),
        JSON.stringify({type: 'assistant', message: {id: 'a1', content: [{type: 'text', text: 'first answer'}]}}),
      ].join('\n'),
    )
    const second = await kit.attach(sessionId)
    await kit.rpc.chat.send({sessionId, text: 'second question'})
    await second.done({hangGuardMs: 10_000})
    const lastTurn = noResume.__turnMessages.at(-1)
    if (!lastTurn) throw new Error('adapter saw no turn')
    const texts = lastTurn.map((message) => (typeof message.content === 'string' ? message.content : ''))
    expect(texts.some((text) => text.includes('first question'))).toBe(true)
    expect(texts.at(-1)).toContain('second question')
  })

  it('sessions.live re-emits after a create and stops on abort (M7 wire gate)', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.sessions.live(undefined, {signal: abort.signal})
    const emissions: number[] = []
    const consumer = (async () => {
      try {
        for await (const metas of iterator) {
          emissions.push(metas.length)
          if (emissions.length === 2) abort.abort()
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) throw error
      }
    })()
    await new Promise((resolve) => setTimeout(resolve, 25))
    await kit.rpc.sessions.create(undefined)
    await consumer
    expect(emissions.length).toBeGreaterThanOrEqual(2)
    expect(emissions.at(-1)).toBeGreaterThan(0)
  })

  it('session intents round-trip over the wire', async () => {
    const {kit} = await bootWire()
    const {sessionId} = await kit.rpc.sessions.create(undefined)
    const renamed = await kit.rpc.sessions.rename({sessionId, title: '  wire  session  '})
    expect(renamed.title).toBe('wire session')
    const markers = await kit.rpc.markers.list({sessionId})
    expect(markers.map((marker) => marker.kind)).toEqual(['new'])
    await expect(kit.rpc.sessions.setModel({sessionId, model: 'definitely-not-a-model'})).rejects.toMatchObject({
      code: 'UNKNOWN_MODEL',
    })
    await kit.rpc.sessions.remove({sessionId})
    const list = await kit.rpc.sessions.list(undefined)
    expect(list.map((meta) => meta.id)).not.toContain(sessionId)
  })

  it('sessions.compact runs a compact turn and writes the marker over the wire', async () => {
    const {kit} = await bootWire()
    const {sessionId} = await kit.rpc.sessions.create(undefined)
    const result = await kit.rpc.sessions.compact({sessionId})
    expect(result.ok).toBe(true)
    const kinds = (await kit.rpc.markers.list({sessionId})).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })

  it('editor.open reaches the injected editor opener', async () => {
    const opened: Array<{file: string; line?: number}> = []
    const {kit} = await bootWire({
      openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})}),
    })
    await kit.rpc.editor.open({file: 'src/thing.ts', line: 3})
    expect(opened).toEqual([{file: 'src/thing.ts', line: 3}])
  })

  it('meta.models serves the harness catalog', async () => {
    const {kit} = await bootWire()
    const models = await kit.rpc.meta.models(undefined)
    expect(models.harness.id).toBe('claude')
    expect(Array.isArray(models.models)).toBe(true)
  })

  it('chat.permissionDecision is reachable and returns ok', async () => {
    const {kit} = await bootWire()
    const result = await kit.rpc.chat.permissionDecision({approvalId: 'none-pending', approved: false})
    expect(result.ok).toBe(true)
  })

  it('page queries stream to the rpc subscriber and reply resolves the asker', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const firstPromise = iterator.next()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const verbResponse = kit.post('/api/page/snapshot', {})
    const first = await firstPromise
    if (first.done) throw new Error('page.queries ended before a query arrived')
    expect(first.value.requestId).toBeTruthy()
    const replied = await kit.rpc.page.reply({requestId: first.value.requestId, data: {ok: true, value: 'snap'}})
    expect(replied.ok).toBe(true)
    const response = await verbResponse
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ok: true, value: 'snap'})
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('page.reply on an unknown request id reports UNKNOWN_REQUEST', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.page.reply({requestId: 'pq-nope', data: {}})).rejects.toMatchObject({
      code: 'UNKNOWN_REQUEST',
    })
  })

  it('gen-ui custom events injected mid-turn replay to a late attach', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    harness.__scripted.hold()
    await kit.rpc.chat.send({sessionId, text: 'draw'})
    const injected = await kit.post(
      '/api/chat/ui',
      {renderId: 'r1', kind: 'choices', question: 'pick one', options: ['a', 'b']},
      sessionId,
    )
    expect(injected.status).toBe(200)
    const late = await kit.attach(sessionId)
    harness.__scripted.release()
    const events = await late.done({hangGuardMs: 10_000})
    expect(events.custom(CONCIV_UI_EVENT).length).toBeGreaterThan(0)
  })

  it('tool durations ride the turn stream after a real in-stream tool call', async () => {
    const opened: string[] = []
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({openInEditor: (file) => opened.push(file)}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    harness.__scripted.scriptToolCall('conciv_open', {file: 'src/from-tool.ts'})
    await kit.rpc.chat.send({sessionId, text: 'open the file'})
    await stream.done({hangGuardMs: 10_000})
    const events = await stream.done({hangGuardMs: 10_000})
    expect(opened).toEqual(['src/from-tool.ts'])
    const durations = events.custom(CONCIV_TOOL_DURATION_EVENT)
    expect(durations.length).toBe(1)
  })
})
