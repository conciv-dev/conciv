import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType} from '@tanstack/ai'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {openSource} from '@conciv/extension/client'
import {toolCallParts} from '../../src/chat/gate.js'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

type WireContext = {kit: Kit; harness: TestHarness}

const uiCallIdOf = (messages: unknown): string | null =>
  Array.isArray(messages) ? (toolCallParts(messages).find((part) => part.name === 'conciv_ui')?.id ?? null) : null

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

  it('send forwards multimodal content and keeps grab references as a text prefix', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.drafts.set({
      sessionId,
      text: 'draft-text',
      selectionStart: 0,
      selectionEnd: 0,
      grabs: ['<button>Save</button>'],
    })
    await kit.rpc.chat.send({
      sessionId,
      content: [
        {type: 'text', content: 'what color is this? '},
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'iVBORw0KGgo='}},
      ],
    })
    await stream.done({hangGuardMs: 10_000})
    const lastTurn = harness.__turnMessages.at(-1)
    if (!lastTurn) throw new Error('adapter saw no turn')
    const lastUser = lastTurn.findLast((message) => message.role === 'user')
    if (!Array.isArray(lastUser?.content)) throw new Error('adapter did not receive multimodal content')
    expect(lastUser.content[0]).toMatchObject({type: 'text', content: '<button>Save</button>\n'})
    expect(lastUser.content[1]).toMatchObject({type: 'text', content: 'what color is this? '})
    expect(lastUser.content[2]).toMatchObject({
      type: 'image',
      source: {type: 'data', mimeType: 'image/png', value: 'iVBORw0KGgo='},
    })
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

  it('sessions.list reflects a create on refetch (live lists are gone by design)', async () => {
    const {kit} = await bootWire()
    const before = await kit.rpc.sessions.list(undefined)
    const {sessionId} = await kit.rpc.sessions.create(undefined)
    const after = await kit.rpc.sessions.list(undefined)
    expect(before.map((meta) => meta.id)).not.toContain(sessionId)
    expect(after.map((meta) => meta.id)).toContain(sessionId)
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

  it('navigation set → get round-trips the app URL stack including per-entry state', async () => {
    const {kit} = await bootWire()
    expect(await kit.rpc.navigation.get(undefined)).toBeNull()
    const state = {
      entries: [{href: '/'}, {href: '/panel/s1/chat', state: {key: 'k1', __TSR_index: 1, usr: {from: 'fab'}}}],
      index: 1,
    }
    await kit.rpc.navigation.set(state)
    expect(await kit.rpc.navigation.get(undefined)).toEqual(state)
    const replaced = {entries: [{href: '/quick'}], index: 0}
    await kit.rpc.navigation.set(replaced)
    expect(await kit.rpc.navigation.get(undefined)).toEqual(replaced)
  })

  it('editor.open reaches the injected editor opener', async () => {
    const opened: Array<{file: string; line?: number}> = []
    const {kit} = await bootWire({
      openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})}),
    })
    await kit.rpc.editor.open({file: 'src/thing.ts', line: 3})
    expect(opened).toEqual([{file: 'src/thing.ts', line: 3}])
  })

  it('extension openSource drives editor.open and openFromFrames over rpc', async () => {
    const opened: Array<{file: string; line?: number}> = []
    const {kit} = await bootWire({
      openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})}),
    })
    const located = {component: null, stack: [], owners: []}
    const viaSource = await openSource(kit.base, {
      ...located,
      frames: [],
      source: {file: 'src/a.ts', line: 7, column: 1},
    })
    expect(viaSource).toBe('opened')
    expect(opened).toEqual([{file: 'src/a.ts', line: 7}])
    const viaFrames = await openSource(kit.base, {...located, frames: [{fileName: 'does-not-exist.ts', line: 1}]})
    expect(viaFrames).toBe('no-source')
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
    const verbResult = kit.rpc.page.run({verb: 'snapshot'})
    const first = await firstPromise
    if (first.done) throw new Error('page.queries ended before a query arrived')
    expect(first.value.requestId).toBeTruthy()
    const replied = await kit.rpc.page.reply({requestId: first.value.requestId, data: {ok: true, value: 'snap'}})
    expect(replied.ok).toBe(true)
    expect(await verbResult).toMatchObject({ok: true, value: 'snap'})
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('page.run round-trips a verb through the rpc queries subscriber', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const answered = (async () => {
      const first = await iterator.next()
      if (first.done) throw new Error('page.queries ended before a query arrived')
      await kit.rpc.page.reply({requestId: first.value.requestId, data: {ok: true, text: 'body text'}})
    })()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const result = await kit.rpc.page.run({verb: 'text', selector: 'body'})
    expect(result).toMatchObject({ok: true, text: 'body text'})
    await answered
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('a mutating page.run lands in page.changes and clearChanges empties it', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const answered = (async () => {
      const first = await iterator.next()
      if (first.done) throw new Error('page.queries ended before a query arrived')
      await kit.rpc.page.reply({requestId: first.value.requestId, data: {ok: true}})
    })()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await kit.rpc.page.run({verb: 'fill', selector: '#name', value: 'Ada'})
    await answered
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toEqual(['fill'])
    expect(changes[0]).toMatchObject({selector: '#name', args: {value: 'Ada'}})
    await kit.rpc.page.clearChanges(undefined)
    expect(await kit.rpc.page.changes(undefined)).toEqual([])
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('page.run with no connected page reports NO_PAGE_CLIENT', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.page.run({verb: 'snapshot'})).rejects.toMatchObject({code: 'NO_PAGE_CLIENT'})
  })

  it('page.run reports PAGE_TIMEOUT when the page never replies', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const consumed = iterator.next()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await expect(kit.rpc.page.run({verb: 'text', selector: 'body', timeout: 100})).rejects.toMatchObject({
      code: 'PAGE_TIMEOUT',
    })
    abort.abort()
    await consumed.catch(() => {})
    await iterator.return(undefined).catch(() => {})
  })

  it('server.* without a bundler bridge reports NO_BUNDLER', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.server.config(undefined)).rejects.toMatchObject({code: 'NO_BUNDLER'})
    await expect(kit.rpc.server.reload({file: 'src/a.ts'})).rejects.toMatchObject({code: 'NO_BUNDLER'})
  })

  it('server.* round-trips a real bundler bridge', async () => {
    const reloaded: string[] = []
    const restarted: boolean[] = []
    const bridge = defineBundlerBridge({
      id: 'wire-test',
      config: () => ({
        root: '/repo',
        base: '/',
        mode: 'development',
        aliases: [{find: '@', replacement: 'src'}],
        plugins: ['solid'],
      }),
      resolve: async (spec, importer) => ({id: importer ? `${importer}!${spec}` : spec}),
      moduleGraph: (file) => [{url: file, importers: ['entry.ts'], importedModules: ['dep.ts']}],
      transform: async (url) => ({code: `transformed:${url}`}),
      urls: () => ({local: ['http://localhost:3000'], network: []}),
      reload: async (file) => {
        reloaded.push(file)
      },
      restart: async (force) => {
        restarted.push(force ?? false)
      },
    })
    const {kit} = await bootWire({bridge})
    expect(await kit.rpc.server.config(undefined)).toMatchObject({root: '/repo', mode: 'development'})
    expect(await kit.rpc.server.resolve({spec: './a', importer: 'b.ts'})).toEqual({id: 'b.ts!./a'})
    expect(await kit.rpc.server.graph({file: 'src/a.ts'})).toEqual([
      {url: 'src/a.ts', importers: ['entry.ts'], importedModules: ['dep.ts']},
    ])
    expect(await kit.rpc.server.transform({url: '/src/a.ts'})).toEqual({code: 'transformed:/src/a.ts'})
    expect(await kit.rpc.server.urls(undefined)).toEqual({local: ['http://localhost:3000'], network: []})
    expect(await kit.rpc.server.reload({file: 'src/hot.ts'})).toEqual({ok: true})
    expect(reloaded).toEqual(['src/hot.ts'])
    expect(await kit.rpc.server.restart({force: true})).toEqual({ok: true})
    expect(restarted).toEqual([true])
  })

  it('page.reply on an unknown request id reports UNKNOWN_REQUEST', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.page.reply({requestId: 'pq-nope', data: {}})).rejects.toMatchObject({
      code: 'UNKNOWN_REQUEST',
    })
  })

  it('conciv_ui blocks the run until chat.uiReply lands the answer as the tool result', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed?'})
    await kit.rpc.chat.send({sessionId, text: 'ask me'})
    const snapshot = await stream.waitFor(
      (chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT && uiCallIdOf(chunk.messages) !== null,
      {hangGuardMs: 10_000},
    )
    if (snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('matched chunk was not a snapshot')
    const toolCallId = uiCallIdOf(snapshot.messages)
    if (!toolCallId) throw new Error('no conciv_ui part in the snapshot')
    await kit.rpc.chat.uiReply({sessionId, toolCallId, value: 'yes'})
    const events = await stream.done({hangGuardMs: 10_000})
    const last = events.all.findLast((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
    if (!last || last.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('no final snapshot')
    expect(JSON.stringify(last.messages)).toContain('"answered":true')
  })

  it('chat.uiReply on an unknown toolCallId reports UNKNOWN_REQUEST', async () => {
    const {kit} = await bootWire()
    const sessionId = await kit.session()
    await expect(kit.rpc.chat.uiReply({sessionId, toolCallId: 'tc-nope', value: 'yes'})).rejects.toMatchObject({
      code: 'UNKNOWN_REQUEST',
    })
  })

  it('a pending conciv_ui question shows its tool-call part to a late attach', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed?'})
    await kit.rpc.chat.send({sessionId, text: 'ask me'})
    const late = await kit.attach(sessionId)
    const snapshot = await late.waitFor(
      (chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT && uiCallIdOf(chunk.messages) !== null,
      {hangGuardMs: 10_000},
    )
    if (snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('matched chunk was not a snapshot')
    const toolCallId = uiCallIdOf(snapshot.messages)
    if (!toolCallId) throw new Error('no conciv_ui part in the snapshot')
    await kit.rpc.chat.uiReply({sessionId, toolCallId, value: 'yes'})
    await late.done({hangGuardMs: 10_000})
  })

  it('a scripted tool call executes the real conciv tool inside the turn', async () => {
    const opened: string[] = []
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({openInEditor: (file) => opened.push(file)}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    harness.__scripted.scriptToolCall('conciv_open', {file: 'src/from-tool.ts'})
    await kit.rpc.chat.send({sessionId, text: 'open the file'})
    await stream.done({hangGuardMs: 10_000})
    expect(opened).toEqual(['src/from-tool.ts'])
  })
})
