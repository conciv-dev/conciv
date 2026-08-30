import {mkdirSync, writeFileSync} from 'node:fs'
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType, StreamProcessor, type StreamChunk} from '@tanstack/ai'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {PAGE_TRANSPORT_ERROR_CODES} from '@conciv/protocol/page-types'
import {createTestHarness, makeRpcClient, withAutoApproval, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {CONCIV_SESSION_HEADER, HarnessSessionId} from '@conciv/protocol/chat-types'
import {openSource} from '@conciv/extension/client'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {hydratedSnapshot} from '../helpers/fake-session.js'
import {userTexts} from '../helpers/snapshots.js'

type WireContext = {kit: Kit; harness: TestHarness}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function partsOf(message: unknown): unknown[] {
  if (!isRecord(message) || !Array.isArray(message.parts)) return []
  return message.parts
}

function runIdsOf(chunks: StreamChunk[], type: StreamChunk['type']): string[] {
  return chunks.flatMap((chunk) => {
    if (chunk.type !== type || !('runId' in chunk)) return []
    return typeof chunk.runId === 'string' ? [chunk.runId] : []
  })
}

function renderedMessages(chunks: StreamChunk[]): unknown[] {
  const processor = new StreamProcessor({})
  for (const chunk of chunks) processor.processChunk(chunk)
  return processor.getMessages()
}

async function snapshotMessages(kit: Kit, sessionId: string): Promise<unknown[]> {
  return (await kit.hydrate(sessionId)).messages
}

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
  it('a turn streams to RUN_FINISHED under the requested run id and lands in the hydrated thread', async () => {
    const {kit} = await bootWire()
    const sessionId = await kit.session()
    const turn = await kit.turn('hello', {session: sessionId, runId: 'wire-1'})
    const events = await turn.done({hangGuardMs: 10_000})
    expect(runIdsOf(events.all, EventType.RUN_FINISHED)).toEqual(['wire-1'])
    expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['hello'])
  })

  it('a join mid-turn replays RUN_STARTED so clients derive generating', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    harness.script.hold()
    const turn = await kit.turn('hello', {session: sessionId, runId: 'wire-2'})
    await turn.waitForRunStart({runId: 'wire-2'})
    const late = kit.join('wire-2')
    await late.waitForRunStart({runId: 'wire-2'})
    harness.script.release()
    const events = await late.done({hangGuardMs: 10_000})
    expect(runIdsOf(events.all, EventType.RUN_STARTED)).toEqual(['wire-2'])
    expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['hello'])
  })

  it('send consumes the server-side draft: the turn is the user text alone and the row is cleared', async () => {
    const {kit} = await bootWire()
    const sessionId = await kit.session()
    await kit.rpc.drafts.set({
      sessionId,
      text: 'draft-text',
      selectionStart: 0,
      selectionEnd: 0,
    })
    const turn = await kit.turn('about the grabbed element', {session: sessionId, runId: 'wire-5'})
    await turn.done({hangGuardMs: 10_000})
    const visibleUser = (await snapshotMessages(kit, sessionId)).findLast(
      (message) => isRecord(message) && message.role === 'user',
    )
    const firstPart = partsOf(visibleUser)[0]
    const text = isRecord(firstPart) && typeof firstPart.content === 'string' ? firstPart.content : ''
    expect(text).toBe('about the grabbed element')
    expect(await kit.rpc.drafts.get({sessionId})).toBeNull()
  })

  it('send forwards multimodal content untouched by the draft row', async () => {
    const {kit} = await bootWire()
    const sessionId = await kit.session()
    await kit.rpc.drafts.set({
      sessionId,
      text: 'draft-text',
      selectionStart: 0,
      selectionEnd: 0,
    })
    const turn = await kit.turn(
      {
        content: [
          {type: 'text', content: 'what color is this? '},
          {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'iVBORw0KGgo='}},
        ],
      },
      {session: sessionId, runId: 'wire-12'},
    )
    await turn.done({hangGuardMs: 10_000})
    const visibleUser = (await snapshotMessages(kit, sessionId)).findLast(
      (message) => isRecord(message) && message.role === 'user',
    )
    if (!isRecord(visibleUser) || !('parts' in visibleUser))
      throw new Error('stream did not include the user message parts')
    expect(visibleUser.parts).toEqual([
      {type: 'text', content: 'what color is this? '},
      {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'iVBORw0KGgo='}},
    ])
    expect(await kit.rpc.drafts.get({sessionId})).toBeNull()

    const followUp = await kit.turn('and what shape is it?', {session: sessionId, runId: 'wire-6'})
    await followUp.done({hangGuardMs: 10_000})
    const priorImage = (await snapshotMessages(kit, sessionId))
      .flatMap((message) => partsOf(message))
      .find((part) => isRecord(part) && part.type === 'image')
    expect(priorImage).toMatchObject({
      type: 'image',
      source: {type: 'data', mimeType: 'image/png', value: 'iVBORw0KGgo='},
    })
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
    const first = await kit.turn('first question', {session: sessionId, runId: 'wire-7'})
    await first.done({hangGuardMs: 10_000})
    const transcript = requireTranscriptPath(noResume)(
      kit.stateRoot,
      HarnessSessionId.parse(`fake-${sessionId}`),
      claudeHome,
    )
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [
        JSON.stringify({type: 'user', message: {content: 'first question'}}),
        JSON.stringify({type: 'assistant', message: {id: 'a1', content: [{type: 'text', text: 'first answer'}]}}),
      ].join('\n'),
    )
    const second = await kit.turn('second question', {session: sessionId, runId: 'wire-8'})
    await second.done({hangGuardMs: 10_000})
    expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['first question', 'second question'])
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
    await expect(kit.rpc.sessions.model({sessionId, model: 'definitely-not-a-model'})).rejects.toMatchObject({
      code: 'UNKNOWN_MODEL',
    })
    await kit.rpc.sessions.delete({sessionId})
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
    await kit.rpc.navigation.set({...state, updatedAt: 100})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...state, updatedAt: 100})
    const replaced = {entries: [{href: '/quick'}], index: 0}
    await kit.rpc.navigation.set({...replaced, updatedAt: 200})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...replaced, updatedAt: 200})
  })

  it('navigation set drops a write whose intent stamp is not strictly newer than the stored one', async () => {
    const {kit} = await bootWire()
    const first = {entries: [{href: '/first'}], index: 0}
    const stale = {entries: [{href: '/stale'}], index: 0}
    const latest = {entries: [{href: '/latest'}], index: 0}

    expect(await kit.rpc.navigation.set({...first, updatedAt: 100})).toEqual({ok: true, applied: true})
    expect(await kit.rpc.navigation.set({...stale, updatedAt: 50})).toEqual({ok: true, applied: false})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...first, updatedAt: 100})

    expect(await kit.rpc.navigation.set({...latest, updatedAt: 150})).toEqual({ok: true, applied: true})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...latest, updatedAt: 150})

    expect(await kit.rpc.navigation.set({...stale, updatedAt: 150})).toEqual({ok: true, applied: false})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...latest, updatedAt: 150})
  })

  it('navigation set refuses a stamp far ahead of the server clock so it cannot wedge later writes', async () => {
    const {kit} = await bootWire()
    const stored = {entries: [{href: '/stored'}], index: 0}
    const absurd = {entries: [{href: '/absurd'}], index: 0}
    const now = Date.now()

    expect(await kit.rpc.navigation.set({...stored, updatedAt: now})).toEqual({ok: true, applied: true})
    expect(await kit.rpc.navigation.set({...absurd, updatedAt: Number.MAX_SAFE_INTEGER})).toEqual({
      ok: true,
      applied: false,
    })
    expect(await kit.rpc.navigation.set({...absurd, updatedAt: now + 25 * 60 * 60 * 1000})).toEqual({
      ok: true,
      applied: false,
    })
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...stored, updatedAt: now})

    const nearFuture = {entries: [{href: '/near-future'}], index: 0}
    expect(await kit.rpc.navigation.set({...nearFuture, updatedAt: now + 60_000})).toEqual({ok: true, applied: true})
    expect(await kit.rpc.navigation.get(undefined)).toEqual({...nearFuture, updatedAt: now + 60_000})
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
    const sessionId = await kit.session()
    const session = () => sessionId
    const viaSource = await openSource(
      kit.base,
      {...located, frames: [], source: {file: 'src/a.ts', line: 7, column: 1}},
      session,
    )
    expect(viaSource).toBe('opened')
    expect(opened).toEqual([{file: 'src/a.ts', line: 7}])
    const viaFrames = await openSource(
      kit.base,
      {...located, frames: [{fileName: 'does-not-exist.ts', line: 1}]},
      session,
    )
    expect(viaFrames).toBe('no-source')
  })

  it('meta.models serves the harness catalog', async () => {
    const {kit} = await bootWire()
    const models = await kit.rpc.meta.models(undefined)
    expect(models.harness.id).toBe('claude')
    expect(Array.isArray(models.models)).toBe(true)
  })

  it('chat.permissionDecision reports a decision that owns no pending ask', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.chat.permissionDecision({approvalId: 'none-pending', approved: false})).rejects.toMatchObject({
      code: 'UNKNOWN_REQUEST',
    })
  })

  it('page queries stream to the rpc subscriber and reply resolves the asker', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const firstPromise = iterator.next()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const verbResult = kit.rpc.registry.call({name: 'page_snapshot', input: {}})
    const first = await firstPromise
    if (first.done) throw new Error('page.queries ended before a query arrived')
    expect(first.value.requestId).toBeTruthy()
    const replied = await kit.rpc.page.reply({
      requestId: first.value.requestId,
      outcome: {ok: true, result: {nodes: [{ref: 'v1', role: 'button', name: 'snap'}]}},
    })
    expect(replied.ok).toBe(true)
    expect(await verbResult).toEqual({nodes: [{ref: 'v1', role: 'button', name: 'snap'}]})
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('registry.call round-trips a page tool through the rpc queries subscriber', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const answered = (async () => {
      const first = await iterator.next()
      if (first.done) throw new Error('page.queries ended before a query arrived')
      await kit.rpc.page.reply({
        requestId: first.value.requestId,
        outcome: {ok: true, result: {text: 'body text'}},
      })
    })()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const result = await kit.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})
    expect(result).toEqual({text: 'body text'})
    await answered
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('a mutating registry.call lands in page.changes and clearChanges empties it', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const answered = (async () => {
      const first = await iterator.next()
      if (first.done) throw new Error('page.queries ended before a query arrived')
      await kit.rpc.page.reply({
        requestId: first.value.requestId,
        outcome: {ok: true, result: {ok: true, value: 'Ada'}},
      })
    })()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await kit.rpc.registry.call({name: 'page_fill', input: {selector: '#name', value: 'Ada'}})
    await answered
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toEqual(['page_fill'])
    expect(changes[0]).toMatchObject({selector: '#name', args: {value: 'Ada'}})
    await kit.rpc.page.clearChanges(undefined)
    expect(await kit.rpc.page.changes(undefined)).toEqual([])
    abort.abort()
    await iterator.return(undefined).catch(() => {})
  })

  it('registry.call with no connected page reports NO_PAGE_CLIENT', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.registry.call({name: 'page_snapshot', input: {}})).rejects.toMatchObject({
      code: 'NO_PAGE_CLIENT',
    })
  })

  it('registry.call reports PAGE_TIMEOUT when the page never replies', async () => {
    const {kit} = await bootWire()
    const abort = new AbortController()
    const iterator = await kit.rpc.page.queries(undefined, {signal: abort.signal})
    const consumed = iterator.next()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await expect(
      kit.rpc.registry.call({name: 'page_wait', input: {selector: 'body', timeout: 100}}),
    ).rejects.toMatchObject({
      code: 'PAGE_TIMEOUT',
    })
    abort.abort()
    await consumed.catch(() => {})
    await iterator.return(undefined).catch(() => {})
  })

  it('server reads without a bundler bridge report NO_BUNDLER, ask-gated writes refuse first', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.server.config(undefined)).rejects.toMatchObject({code: 'NO_BUNDLER'})
    await expect(kit.rpc.server.reload({file: 'src/a.ts'})).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
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
    const {sessionId} = await kit.rpc.sessions.create(undefined)
    const sessionRpc = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
    await withAutoApproval(kit.base, sessionId, async () => {
      expect(await sessionRpc.server.reload({file: 'src/hot.ts'})).toEqual({ok: true})
      expect(await sessionRpc.server.restart({force: true})).toEqual({ok: true})
    })
    expect(reloaded).toEqual(['src/hot.ts'])
    expect(restarted).toEqual([true])
  })

  it('page.reply without a session header is refused as unidentified', async () => {
    const {kit} = await bootWire()
    const response = await fetch(`${kit.base}/rpc/page/reply`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: {requestId: 'pq-nope', outcome: {ok: true, result: {}}}}),
    })
    expect(response.status).toBe(401)
  })

  it('page.reply on an unknown request id reports UNKNOWN_REQUEST', async () => {
    const {kit} = await bootWire()
    await expect(kit.rpc.page.reply({requestId: 'pq-nope', outcome: {ok: true, result: {}}})).rejects.toMatchObject({
      code: 'UNKNOWN_REQUEST',
    })
  })

  it('page.reply refuses a transport code the page invented, so codes stay declared', async () => {
    const {kit} = await bootWire()
    const response = await fetch(`${kit.base}/rpc/page/reply`, {
      method: 'POST',
      headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: await kit.session()},
      body: JSON.stringify({
        json: {requestId: 'pq-nope', outcome: {ok: false, error: {code: 'weird-thing', message: 'boom'}}},
      }),
    })
    expect(response.status).toBe(400)
  })

  it('page.reply refuses a transport code only the server may produce, so the page cannot forge one', async () => {
    const {kit} = await bootWire()
    const statuses: number[] = []
    const sessionId = await kit.session()
    for (const code of PAGE_TRANSPORT_ERROR_CODES) {
      const response = await fetch(`${kit.base}/rpc/page/reply`, {
        method: 'POST',
        headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: sessionId},
        body: JSON.stringify({
          json: {requestId: 'pq-nope', outcome: {ok: false, error: {code, message: 'boom'}}},
        }),
      })
      statuses.push(response.status)
    }
    expect(statuses).toEqual(PAGE_TRANSPORT_ERROR_CODES.map(() => 400))
  })

  it('conciv_ui blocks the run until chat.uiReply lands the answer as the tool result', async () => {
    const {kit, harness} = await bootWire()
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "return await external_conciv_ui({kind: 'confirm', question: 'Proceed?'})",
    })
    const stream = await kit.turn('ask me', {session: sessionId, runId: 'wire-9'})
    const call = await stream.waitForToolCall('conciv_ui', {hangGuardMs: 10_000})
    await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
    const events = await stream.done({hangGuardMs: 10_000})
    expect(JSON.stringify(renderedMessages(events.all))).toContain('"answered":true')
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
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "return await external_conciv_ui({kind: 'confirm', question: 'Proceed?'})",
    })
    const turn = await kit.turn('ask me', {session: sessionId, runId: 'wire-10'})
    await turn.waitForRunStart({runId: 'wire-10'})
    const late = kit.join('wire-10')
    const call = await late.waitForToolCall('conciv_ui', {hangGuardMs: 10_000})
    await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
    await late.done({hangGuardMs: 10_000})
    await turn.done({hangGuardMs: 10_000})
  })

  it('a scripted code-mode call executes the real open capability inside the turn', async () => {
    const opened: string[] = []
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({openInEditor: (file) => opened.push(file)}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "return await external_open({file: 'src/from-tool.ts'})",
    })
    const stream = await kit.turn('open the file', {session: sessionId, runId: 'wire-11'})
    await stream.done({hangGuardMs: 10_000})
    expect(opened).toEqual(['src/from-tool.ts'])
  })
})
