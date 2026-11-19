import {afterEach, describe, expect, it} from 'vitest'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {ChatClient} from '@conciv/ai/testkit'
import {StreamReconnectLimitError} from '@conciv/ai/client'
import {
  browserRpcConnection,
  makeBrowserRpcClient,
  makeRpcClient,
  type RpcClient,
  type SessionMeta,
} from '@conciv/contract'
import {chatConnection, type ChatConnection} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers.js'
import {pageTabs, type PageReply} from '@conciv/plugin-page-testkit/page-tabs'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {
  type ChatEvent,
  ChatEventType,
  idleFailedEvent,
  runLifecycleEvent,
  sessionRunEvent,
  type RunLifecycle,
} from '@conciv/protocol/chat-event-types'
import {MutationObserver, QueryClient} from '@tanstack/solid-query'
import {makeQueryUtils} from '../src/query-utils.js'
import {getEventMeta, ORPCError} from '@orpc/client'
import {onlineManager} from '@tanstack/query-core'
import {isReachabilityError, setupEngineReachability} from '../src/reachability.js'

describe('chat client', () => {
  let kit: ClientKit | undefined
  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  type Observed = {messages: ChatMessage[]; generating: boolean}

  type ClientUpdate = {kind: 'messages'; messages: ChatMessage[]} | {kind: 'generating'; generating: boolean}

  function observeClient(
    base: string,
    sessionId: string,
    onUpdate: (update: ClientUpdate) => void,
  ): {client: ChatClient; observed: Observed} {
    const observed: Observed = {messages: [], generating: false}
    const client = new ChatClient({
      connection: chatConnection(makeRpcClient(base), base, sessionId),
      threadId: sessionId,
      persistence: true,
      onMessagesChange: (messages) => {
        observed.messages = messages
        onUpdate({kind: 'messages', messages})
      },
      onSessionGeneratingChange: (generating) => {
        observed.generating = generating
        onUpdate({kind: 'generating', generating})
      },
    })
    return {client, observed}
  }

  const readText = (message: ChatMessage): string =>
    message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')

  describe('ChatClient over chatConnection (useChatSession composition, headless)', () => {
    it('sendMessage round-trips: user message renders, assistant text streams in, generating settles', async () => {
      kit = await bootClientKit()
      const sessionId = await kit.session()
      const settled = Promise.withResolvers<void>()
      const {client, observed} = observeClient(kit.base, sessionId, (update) => {
        if (update.kind === 'generating' && !update.generating) settled.resolve()
      })
      client.subscribe()
      try {
        await client.sendMessage('hello')
        await settled.promise
        expect(observed.messages[0]?.role).toBe('user')
        expect(
          observed.messages
            .filter((message) => message.role === 'assistant')
            .map(readText)
            .join(''),
        ).toContain('ok')
      } finally {
        client.unsubscribe()
        client.dispose()
      }
    }, 60_000)

    it('a run whose adapter stream dies after RUN_STARTED still settles generating', async () => {
      kit = await bootClientKit()
      const sessionId = await kit.session()
      const {client, observed} = observeClient(kit.base, sessionId, () => {})
      client.subscribe()
      try {
        kit.harness.script.scriptError('adapter stream blew up')
        await client.sendMessage('hello')
        expect(observed.generating).toBe(false)
      } finally {
        client.unsubscribe()
        client.dispose()
      }
    }, 60_000)

    it('a client mounting mid-turn hydrates the thread and rejoins the run in flight', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      clientKit.gate.hold()
      const elsewhere = await clientKit.turn('started elsewhere', {session: sessionId, runId: 'chat-client-1'})
      await elsewhere.waitForRunStart()

      const hydrated = Promise.withResolvers<ChatMessage[]>()
      const settled = Promise.withResolvers<void>()
      const {client} = observeClient(clientKit.base, sessionId, (update) => {
        if (update.kind === 'messages' && update.messages.length > 0) hydrated.resolve(update.messages)
        if (update.kind === 'generating' && !update.generating) settled.resolve()
      })
      client.subscribe()
      client.attach()
      try {
        expect((await hydrated.promise).some((message) => readText(message).includes('started elsewhere'))).toBe(true)
        clientKit.gate.release()
        await settled.promise
      } finally {
        client.unsubscribe()
        client.dispose()
      }
    }, 60_000)

    it('a client that rejoined a run settles generating when the run is stopped elsewhere', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      clientKit.gate.hold()
      const elsewhere = await clientKit.turn('stopped elsewhere', {session: sessionId, runId: 'chat-client-stop'})
      await elsewhere.waitForRunStart()

      const generating = Promise.withResolvers<void>()
      const settled = Promise.withResolvers<'settled'>()
      const {client} = observeClient(clientKit.base, sessionId, (update) => {
        if (update.kind !== 'generating') return
        if (update.generating) generating.resolve()
        if (!update.generating) settled.resolve('settled')
      })
      client.subscribe()
      client.attach()
      try {
        await generating.promise
        await clientKit.rpc.chat.stop({sessionId, runIds: ['chat-client-stop']})
        const outcome = await Promise.race([
          settled.promise,
          new Promise<string>((resolve) => setTimeout(resolve, 5_000, 'still generating after the stop')),
        ])
        expect(outcome).toBe('settled')
      } finally {
        clientKit.gate.release()
        client.unsubscribe()
        client.dispose()
      }
    }, 60_000)
  })
})

describe('chat connection', () => {
  let kit: ClientKit | undefined
  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  async function drainRun(connection: ChatConnection, abort: AbortController): Promise<ChatEvent[]> {
    const seen: ChatEvent[] = []
    for await (const chunk of connection.subscribe(abort.signal)) {
      seen.push(chunk)
      if (chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR) return seen
    }
    return seen
  }

  async function opened(): Promise<{rpc: RpcClient; sessionId: string; connection: ChatConnection}> {
    const clientKit = await bootClientKit()
    kit = clientKit
    const sessionId = await clientKit.session()
    const rpc = makeRpcClient(clientKit.base)
    return {rpc, sessionId, connection: chatConnection(rpc, clientKit.base, sessionId)}
  }

  async function runTurn(runId: string, parts: ChatMessage['parts'], extra: ChatMessage[] = []) {
    const {rpc, sessionId, connection} = await opened()
    const abort = new AbortController()
    const draining = drainRun(connection, abort)
    await connection.send([...extra, {id: 'u-last', role: 'user', parts}], undefined, undefined, {
      threadId: sessionId,
      runId,
    })
    const seen = await draining
    abort.abort()
    return {rpc, sessionId, seen, thread: threadJson(await rpc.chat.hydrate({sessionId}))}
  }

  function threadJson(hydration: {messages: unknown[]}): string {
    return JSON.stringify(hydration.messages)
  }

  describe('chatConnection', () => {
    it('carries the run it starts and leaves the assistant reply on the thread', async () => {
      const {seen, thread} = await runTurn('chat-connection-1', [{type: 'text', content: 'hello'}])

      expect(seen.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      expect(thread).toContain('"role":"assistant"')
    }, 60_000)

    it('sends only the LAST user message as the turn', async () => {
      const {thread} = await runTurn(
        'chat-connection-2',
        [{type: 'text', content: 'second line'}],
        [
          {id: 'u1', role: 'user', parts: [{type: 'text', content: 'first'}]},
          {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'ok'}]},
        ],
      )

      expect(thread).toContain('second line')
      expect(thread).not.toContain('first')
    }, 60_000)

    it('preserves text and image content through the turn', async () => {
      const {thread} = await runTurn('chat-connection-3', [
        {type: 'text', content: 'describe this'},
        {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
      ])

      expect(thread).toContain('describe this')
      expect(thread).toContain('aGVsbG8=')
      expect(thread).toContain('image/png')
    }, 60_000)

    it('carries a turn on the browser rpc socket, and a join resumed from an event id replays only what came after it', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      const browser = makeBrowserRpcClient(clientKit.base)
      try {
        const connection = chatConnection(browser.rpc, clientKit.base, sessionId)
        const watcher = watch(connection)
        await sendTurn(connection, sessionId, 'over-the-socket')
        await watcher.finished
        watcher.abort()
        const replayed = await collected(await browser.rpc.chat.join({runId: 'over-the-socket'}))
        const cut = replayed.findIndex((chunk) => chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT)
        const lastEventId = getEventMeta(replayed[cut])?.id
        const resumed = await collected(await browser.rpc.chat.join({runId: 'over-the-socket', lastEventId}))

        expect(replayed.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
        expect(resumed.map((chunk) => getEventMeta(chunk)?.id)).toEqual(
          replayed.slice(cut + 1).map((chunk) => getEventMeta(chunk)?.id),
        )
      } finally {
        browser.close()
      }
    }, 60_000)
  })

  describe('chatConnection streams', () => {
    it('a stream that breaks mid-turn ends the turn with an error and stops streaming', async () => {
      const server = await breakingEventsServer()
      const errors: Error[] = []
      const client = new ChatClient({
        connection: chatConnection(makeRpcClient(server.base), server.base, 'conciv_breaking'),
        threadId: 'conciv_breaking',
        onError: (error) => errors.push(error),
      })
      client.subscribe()
      try {
        await client.sendMessage('hello').catch(() => undefined)
        expect(errors.length).toBeGreaterThan(0)
        expect(client.getIsLoading()).toBe(false)
      } finally {
        client.unsubscribe()
        client.dispose()
        await server.close()
      }
    }, 10_000)

    it('a joined run ends on its own terminal chunk, and a run stopped with only its lifecycle is closed', async () => {
      const threadId = 'conciv_joined'
      const ended = (runId: string, phase: RunLifecycle['phase'], error: string | null = null) =>
        runLifecycleEvent.create({runId, phase, startedAt: 1, finishedAt: 2, serverNow: 2, error})
      const replays: Record<string, object[]> = {
        completes: [
          ended('completes', 'completed'),
          {type: ChatEventType.RUN_FINISHED, threadId, runId: 'completes', finishReason: 'length'},
        ],
        fails: [
          ended('fails', 'failed', 'provider down'),
          {type: ChatEventType.RUN_ERROR, threadId, runId: 'fails', message: 'provider down'},
        ],
        'idle-fails': [
          ended('idle-fails', 'completed'),
          idleFailedEvent.create({runId: 'idle-fails'}),
          {type: ChatEventType.RUN_FINISHED, threadId, runId: 'idle-fails', finishReason: 'stop'},
        ],
        stopped: [ended('stopped', 'aborted')],
        'stopped-after-a-tool-step': [
          {type: ChatEventType.RUN_FINISHED, threadId, runId: 'stopped-after-a-tool-step', finishReason: 'tool_calls'},
          ended('stopped-after-a-tool-step', 'aborted'),
        ],
      }
      const server = await eventsServer((request, runId) => {
        const frames = replays[runId]
        if (!request.url?.endsWith('/join') || frames === undefined) return null
        return {frames: [{type: ChatEventType.RUN_STARTED, threadId, runId}, ...frames], ending: 'ended'}
      })
      const runErrors: string[] = []
      const connection = chatConnection(makeRpcClient(server.base), server.base, threadId, {
        onRunError: () => runErrors.push('run error'),
      })
      const collectLast = async (runId: string) => {
        const seen: ChatEvent[] = []
        for await (const chunk of connection.joinRun(runId)) seen.push(chunk)
        const last = seen.at(-1)
        if (last?.type === ChatEventType.RUN_FINISHED) return {finished: last.finishReason}
        if (last?.type === ChatEventType.RUN_ERROR) return {error: last.message}
        return {last: last?.type}
      }
      try {
        expect({
          completes: await collectLast('completes'),
          fails: await collectLast('fails'),
          idleFails: await collectLast('idle-fails'),
          stopped: await collectLast('stopped'),
          stoppedAfterAToolStep: await collectLast('stopped-after-a-tool-step'),
          runErrors,
        }).toEqual({
          completes: {finished: 'length'},
          fails: {error: 'provider down'},
          idleFails: {finished: 'stop'},
          stopped: {finished: 'stop'},
          stoppedAfterAToolStep: {finished: 'stop'},
          runErrors: ['run error', 'run error'],
        })
      } finally {
        await server.close()
      }
    }, 10_000)

    it('aborting a live subscription ends it cleanly, with no error', async () => {
      const {sessionId, connection} = await opened()
      const watcher = watch(connection)
      await sendTurn(connection, sessionId, 'abort-1')
      await watcher.finished
      watcher.abort()
      await expect(watcher.ended).resolves.toBeUndefined()
    }, 30_000)

    it('a run the chat client gave up on is followed by the subscription until the user leaves, never after', async () => {
      const threadId = 'conciv_handed_over'
      const joins = Array.from({length: 3}, () => Promise.withResolvers<{runId: string; response: ServerResponse}>())
      const joinCalls: string[] = []
      const server = await eventsServer((request, runId, response) => {
        if (request.url?.endsWith('/events')) return {frames: [], ending: 'held'}
        if (!request.url?.endsWith('/join')) return null
        joins[joinCalls.length - 1]?.resolve({runId, response})
        return {frames: [], ending: 'held'}
      })
      const rpc = makeRpcClient(server.base, {
        interceptors: [
          ({path, input, next}) => {
            if (path.join('.') === 'chat.join') joinCalls.push(readRunId(JSON.stringify(input)))
            return next()
          },
        ],
      })
      const connection = chatConnection(rpc, server.base, threadId)
      try {
        const leaving = watch(connection)
        const detached = new AbortController()
        const leftBehind = collected(connection.joinRun('left-behind', detached.signal))
        await joins[0]?.promise
        detached.abort()
        leaving.abort()
        expect(await leftBehind).toEqual([])
        await leaving.ended
        expect({joinCalls, seen: leaving.seen}).toEqual({joinCalls: ['left-behind'], seen: []})
        const staying = watch(connection)
        const deadline = new AbortController()
        const givenUp = collected(connection.joinRun('given-up', deadline.signal))
        await joins[1]?.promise
        deadline.abort()
        await givenUp
        const handedOver = await joins[2]?.promise
        handedOver?.response.write(
          sse({type: ChatEventType.RUN_FINISHED, threadId, runId: 'given-up', finishReason: 'stop'}),
        )
        await staying.finished
        const followEnded = new Promise((closed) => handedOver?.response.on('close', closed))
        staying.abort()
        await followEnded
        await staying.ended
        expect(joinCalls).toEqual(['left-behind', 'given-up', 'given-up'])
      } finally {
        connection.close()
        await server.close()
      }
    }, 10_000)

    it('every subscriber gets each chunk, and one that aborts stops receiving', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      const connection = chatConnection(makeRpcClient(clientKit.base), clientKit.base, sessionId)
      clientKit.gate.hold()
      const warming = await clientKit.turn('fan-out-0', {session: sessionId, runId: 'fan-out-0'})
      await warming.waitForRunStart()
      const [staying, leaving] = [watch(connection), watch(connection)]
      try {
        expect(await Promise.all([staying.firstAnnounced, leaving.firstAnnounced])).toEqual(['fan-out-0', 'fan-out-0'])
        clientKit.gate.release()
        await warming.done()
        await sendTurn(connection, sessionId, 'fan-out-1')
        await Promise.all([staying.finished, leaving.finished])
        expect(leaving.seen.map((chunk) => chunk.type)).toEqual(staying.seen.map((chunk) => chunk.type))
        const before = leaving.seen.length
        leaving.abort()
        await leaving.ended
        await sendTurn(connection, sessionId, 'fan-out-2')
        expect(leaving.seen).toHaveLength(before)
        expect(staying.seen.length).toBeGreaterThan(before)
      } finally {
        clientKit.gate.release()
        staying.abort()
        leaving.abort()
        await Promise.all([staying.ended, leaving.ended])
      }
    }, 30_000)
  })

  type Served = {frames: object[]; ending: 'broken' | 'ended' | 'held'}

  function breakingEventsServer(): Promise<{base: string; close: () => Promise<void>}> {
    const run = {threadId: 'conciv_breaking', runId: 'breaking-run'}
    const frames = [
      {type: ChatEventType.RUN_STARTED, ...run},
      {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'broken-reply', role: 'assistant'},
      {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'broken-reply', delta: 'half a rep'},
    ]
    return eventsServer((request) => (request.url?.endsWith('/send') ? {frames, ending: 'broken'} : null))
  }

  async function eventsServer(
    served: (request: IncomingMessage, runId: string, response: ServerResponse) => Served | null,
  ): Promise<{base: string; close: () => Promise<void>}> {
    const server: Server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const body = Buffer.concat(await collected<Buffer>(request)).toString()
      const reply = RPC_CHAT_PATHS.includes(url.pathname) ? served(request, readRunId(body), response) : null
      if (reply === null) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {'content-type': 'text/event-stream'})
      const frames = reply.frames.map(sse).join('')
      if (reply.ending === 'held') {
        response.flushHeaders()
        response.write(frames)
        return
      }
      if (reply.ending === 'broken') response.write(frames, () => response.destroy())
      else response.end(`${frames}event: done\ndata: ${JSON.stringify({json: null})}\n\n`)
    })
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    return {
      base: `http://127.0.0.1:${port}`,
      close: () => new Promise((closed) => server.close(() => closed())),
    }
  }

  const RPC_CHAT_PATHS = ['/rpc/chat/send', '/rpc/chat/join', '/rpc/chat/events']

  function sse(frame: object): string {
    return `event: message\ndata: ${JSON.stringify({json: frame})}\n\n`
  }

  function readRunId(body: string): string {
    return /"runId":"([^"]+)"/.exec(body)?.[1] ?? ''
  }

  function watch(connection: ChatConnection) {
    const abort = new AbortController()
    const seen: ChatEvent[] = []
    const finished = Promise.withResolvers<void>()
    const firstAnnounced = Promise.withResolvers<string>()
    const ended = (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) {
        seen.push(chunk)
        if (chunk.type === ChatEventType.RUN_FINISHED) finished.resolve()
        const announced = sessionRunEvent.parse(chunk)
        if (announced !== null) firstAnnounced.resolve(announced.runId)
      }
    })()
    return {
      seen,
      finished: finished.promise,
      firstAnnounced: firstAnnounced.promise,
      ended,
      abort: () => abort.abort(),
    }
  }
})

describe('chat reconnect', () => {
  let kit: ClientKit | undefined
  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  describe('chatConnection reconnect', () => {
    it('survives a server restart: a turn sent afterwards still streams to completion', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      const connection = chatConnection(makeRpcClient(clientKit.base), clientKit.base, sessionId)

      const before = new AbortController()
      const firstRun = collect(connection.subscribe(before.signal))
      await connection.send(
        [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'before'}]}],
        undefined,
        undefined,
        {
          threadId: sessionId,
          runId: 'reconnect-1',
        },
      )
      expect((await firstRun).at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      before.abort()

      await clientKit.restartServer()

      const after = new AbortController()
      const secondRun = collect(connection.subscribe(after.signal))
      await connection.send(
        [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'after'}]}],
        undefined,
        undefined,
        {
          threadId: sessionId,
          runId: 'reconnect-2',
        },
      )
      expect((await secondRun).at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      after.abort()

      expect(JSON.stringify((await connection.hydrate(sessionId)).messages)).toContain('after')
    }, 90_000)
  })

  async function collect(stream: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
    const seen: ChatEvent[] = []
    for await (const chunk of stream) {
      seen.push(chunk)
      if (chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR) return seen
    }
    return seen
  }
})

describe('chat refresh', () => {
  let kit: ClientKit | undefined
  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  function userTexts(messages: readonly unknown[]): string {
    return JSON.stringify(messages)
  }

  describe('chatConnection refresh', () => {
    it('serves the transcript the server leads, including a turn this client never sent', async () => {
      kit = await bootClientKit()
      const sessionId = await kit.session()
      const connection = chatConnection(makeRpcClient(kit.base), kit.base, sessionId)

      expect(userTexts((await connection.refresh()).messages)).toBe('[]')

      const elsewhere = await kit.turn('led from the server', {session: sessionId, runId: 'refresh-1'})
      await elsewhere.done()

      expect(userTexts((await connection.refresh()).messages)).toContain('led from the server')
    }, 60_000)

    it('hydrate asks the server for one page and walks back with the cursor', async () => {
      kit = await bootClientKit()
      const sessionId = await kit.session()
      for (const [index, text] of ['first', 'second'].entries()) {
        const turn = await kit.turn(text, {session: sessionId, runId: `paged-${index}`})
        await turn.done()
      }
      const connection = chatConnection(makeRpcClient(kit.base), kit.base, sessionId)

      const newest = await connection.hydrate(sessionId, {limit: 2})
      expect(userTexts(newest.messages)).toContain('second')
      expect(userTexts(newest.messages)).not.toContain('first')
      expect(newest.page).toMatchObject({truncated: true})

      const cursor = newest.page?.truncated ? newest.page.cursor : undefined
      const older = await connection.hydrate(sessionId, {limit: 2, before: cursor})
      expect(userTexts(older.messages)).toContain('first')
      expect(older.page).toEqual({truncated: false})
    }, 60_000)

    it('refreshes without ever opening a stream', async () => {
      kit = await bootClientKit()
      const sessionId = await kit.session()
      const connection = chatConnection(makeRpcClient(kit.base), kit.base, sessionId)
      const seen: ChatEvent[] = []
      const abort = new AbortController()
      void (async () => {
        for await (const chunk of connection.subscribe(abort.signal)) seen.push(chunk)
      })()

      const hydration = await connection.refresh()

      expect(hydration.activeRun).toBeNull()
      expect(seen.filter((chunk) => chunk.type === ChatEventType.MESSAGES_SNAPSHOT)).toEqual([])
      abort.abort()
    }, 60_000)
  })
})

describe('session streams on the rpc socket', () => {
  let kit: ClientKit | undefined

  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  function textReply(text: string): PageReply {
    return {type: 'success', result: {value: {text}, files: []}}
  }

  async function nextEvent(source: AsyncIterator<ChatEvent>): Promise<ChatEvent> {
    const next = await source.next()
    if (next.done) throw new Error('the chat stream closed before a session event arrived')
    return next.value
  }

  describe('the rpc socket of the api base', () => {
    it('carries a page query to the tab and the reply resolves the caller', async () => {
      const tabs = pageTabs()
      const booted = await bootClientKit({plugins: [tabs.plugin]})
      kit = booted
      const tab = await tabs.open(await booted.session(), () => undefined)
      const calling = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})

      await tab.reply(await tab.requested(), textReply('body text'))

      expect(await calling).toEqual({text: 'body text'})
      tab.end()
    })

    it('resubscribes the chat stream after the engine restarts and serves the session events again', async () => {
      const booted = await bootClientKit()
      kit = booted
      const sessionId = await booted.session()
      const browser = makeBrowserRpcClient(booted.base)
      const abort = new AbortController()
      const connection = chatConnection(makeRpcClient(booted.base), booted.base, sessionId)
      const seen: ChatEvent[] = []
      const failures: unknown[] = []
      const collecting: {done: Promise<void>} = {done: Promise.resolve()}
      try {
        const events = await browser.rpc.chat.events({sessionId}, {signal: abort.signal})
        const warming = nextEvent(events)
        booted.gate.hold()
        const turningBefore = sendTurn(connection, sessionId, 'push-before')
        const before = await warming
        booted.gate.release()
        await turningBefore
        expect(sessionRunEvent.parse(before)).toEqual({runId: 'push-before'})

        await booted.restartServer()
        async function collect(): Promise<void> {
          for await (const chunk of events) seen.push(chunk)
        }
        collecting.done = collect().catch((error: unknown) => {
          if (!abort.signal.aborted || error !== abort.signal.reason) failures.push(error)
        })
        booted.gate.hold()
        const turningAfter = sendTurn(connection, sessionId, 'push-after')
        await expect.poll(() => ({seen: seen.length, failures}), {timeout: 5_000}).toEqual({seen: 1, failures: []})
        booted.gate.release()
        await turningAfter

        expect(seen.map((chunk) => sessionRunEvent.parse(chunk))).toEqual([{runId: 'push-after'}])
      } finally {
        booted.gate.release()
        abort.abort()
        await collecting.done
        browser.close()
      }
      expect(failures).toEqual([])
    })

    it('hands the page plane and the chat stream the one rpc connection of the api base', async () => {
      const booted = await bootClientKit()
      kit = booted
      const plane = browserRpcConnection(booted.base)
      const chat = browserRpcConnection(booted.base)

      expect(chat.link).toBe(plane.link)
      chat.release()
      const held = browserRpcConnection(booted.base)
      expect(held.link).toBe(plane.link)
      plane.release()
      held.release()
      const keptByKit = browserRpcConnection(booted.base)
      expect(keptByKit.link).toBe(plane.link)
      keptByKit.release()
      kit = undefined
      await booted.cleanup()
      const reopened = browserRpcConnection(booted.base)
      expect(reopened.link).not.toBe(plane.link)
      reopened.release()
    })
  })

  describe('a turn across rpc socket drops', () => {
    const DROPS_PAST_BUDGET = 6
    const PACED_TEXT = 'a'.repeat(600)
    const POLL = {timeout: 15_000, interval: 50}

    function textDeltas(seen: ChatEvent[]): number {
      return seen.filter((chunk) => chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT).length
    }

    async function streamedTurn(booted: ClientKit, runId: string) {
      const sessionId = await booted.session()
      const browser = makeBrowserRpcClient(booted.base)
      const connection = chatConnection(browser.rpc, booted.base, sessionId)
      const abort = new AbortController()
      const seen: ChatEvent[] = []
      void (async () => {
        for await (const chunk of connection.subscribe(abort.signal)) seen.push(chunk)
      })().catch(() => undefined)
      const outcome: {error: unknown} = {error: undefined}
      const sending = connection
        .send([{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: runId}]}], undefined, abort.signal, {
          threadId: sessionId,
          runId,
        })
        .catch((error: unknown) => {
          outcome.error = error
        })
      const end = async (): Promise<void> => {
        abort.abort()
        await sending
        browser.close()
      }
      return {seen, outcome, sending, end}
    }

    it('keeps streaming past more drops than the reconnect budget when events arrive between them', async () => {
      const booted = await bootClientKit()
      kit = booted
      booted.harness.script.scriptTurn({toolCalls: [], text: PACED_TEXT, textPace: {chunk: 1, everyMs: 50}})
      const turn = await streamedTurn(booted, 'many-drops')
      for (const drop of Array.from({length: DROPS_PAST_BUDGET}, (_, index) => index)) {
        const before = textDeltas(turn.seen)
        await expect.poll(() => textDeltas(turn.seen), POLL).toBeGreaterThan(before)
        await booted.restartServer()
        expect(turn.outcome.error, `drop ${drop + 1}`).toBeUndefined()
      }
      const afterDrops = textDeltas(turn.seen)

      await expect.poll(() => textDeltas(turn.seen), POLL).toBeGreaterThan(afterDrops)
      expect(turn.outcome.error).toBeUndefined()
      await turn.end()
    }, 60_000)

    it('gives up with the reconnect ceiling once the engine stays gone with no event between attempts', async () => {
      const booted = await bootClientKit()
      booted.harness.script.holdStart()
      const turn = await streamedTurn(booted, 'engine-gone')
      await booted.cleanup()

      await expect
        .poll(() => turn.outcome.error, {timeout: 40_000, interval: 100})
        .toBeInstanceOf(StreamReconnectLimitError)
      expect(turn.seen.filter((chunk) => chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT)).toEqual([])
      await turn.end()
    }, 60_000)
  })

  describe('a session the page is not showing', () => {
    const pageText = {name: 'page_text', input: {selector: 'body'}}
    const POLL = {timeout: 4_000, interval: 50}

    function captureOutcome(call: Promise<unknown>): Promise<unknown> {
      return call.catch((error: unknown) => ({
        rejected: error instanceof ORPCError ? error.code : 'unexpected',
        message: error instanceof Error ? error.message : String(error),
      }))
    }

    async function bootWithTabs() {
      const tabs = pageTabs()
      const booted = await bootClientKit({plugins: [tabs.plugin]})
      kit = booted
      return {booted, tabs, sessionId: await booted.session()}
    }

    it('refuses its page tools at once, and serves them again once the page shows it', async () => {
      const {booted, tabs, sessionId: background} = await bootWithTabs()
      const {sessionId: shown} = await booted.rpc.sessions.create(undefined)
      const shownTab = await tabs.open(shown, () => textReply('shown'))
      const backgroundRpc = makeRpcClient(booted.base, {headers: {[CONCIV_SESSION_HEADER]: background}})

      await expect
        .poll(() => captureOutcome(backgroundRpc.registry.call(pageText)), POLL)
        .toMatchObject({
          rejected: 'NO_PAGE_CLIENT',
          message: expect.stringContaining(
            'the page is showing another session; switch back to this session to use page tools',
          ),
        })

      const backgroundTab = await tabs.open(background, () => textReply('shown again'))
      await expect
        .poll(() => captureOutcome(backgroundRpc.registry.call(pageText)), POLL)
        .toEqual({text: 'shown again'})

      backgroundTab.end()
      shownTab.end()
    }, 15_000)

    it('stops serving page tools once its tab ends, while the chat stream on the rpc socket keeps serving', async () => {
      const {booted, tabs, sessionId} = await bootWithTabs()
      const abort = new AbortController()
      const browser = makeBrowserRpcClient(booted.base)
      const events = await browser.rpc.chat.events({sessionId}, {signal: abort.signal})
      const tab = await tabs.open(sessionId, () => textReply('once'))

      await expect.poll(() => captureOutcome(booted.rpc.registry.call(pageText)), POLL).toEqual({text: 'once'})
      tab.end()
      await expect
        .poll(() => captureOutcome(booted.rpc.registry.call(pageText)), POLL)
        .toMatchObject({rejected: 'NO_PAGE_CLIENT'})

      const arriving = nextEvent(events)
      booted.gate.hold()
      const turning = sendTurn(
        chatConnection(makeRpcClient(booted.base), booted.base, sessionId),
        sessionId,
        'after-tab',
      )
      expect(sessionRunEvent.parse(await arriving)).toEqual({runId: 'after-tab'})
      booted.gate.release()
      await turning
      abort.abort()
      browser.close()
    }, 15_000)
  })
})

describe('query utils', () => {
  let kit: ClientKit | undefined
  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  type QueryFixture = {
    sessionId: string
    rpc: ReturnType<typeof makeRpcClient>
    utils: ReturnType<typeof makeQueryUtils>
    queryClient: QueryClient
  }

  async function bootQueryFixture(): Promise<QueryFixture> {
    kit = await bootClientKit()
    const rpc = makeRpcClient(kit.base)
    const {sessionId} = await rpc.sessions.create(undefined)
    return {sessionId, rpc, utils: makeQueryUtils(rpc), queryClient: new QueryClient()}
  }

  describe('makeQueryUtils', () => {
    it('queryOptions fetch through the real wire', async () => {
      const {sessionId, utils, queryClient} = await bootQueryFixture()
      const {sessions} = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
      expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
      const models = await queryClient.fetchQuery(utils.meta.models.queryOptions({input: {sessionId}}))
      expect(models.harness.id).toBe('fake-client')
    })

    it('mutationOptions execute intents', async () => {
      const {sessionId, utils, queryClient} = await bootQueryFixture()
      const rename = new MutationObserver(queryClient, utils.sessions.rename.mutationOptions())
      const renamed = await rename.mutate({sessionId, title: 'named by mutation'})
      expect(renamed.title).toBe('named by mutation')
    })

    it('every session row says when its newest run started: null before the first run, then that run', async () => {
      const {sessionId, rpc} = await bootQueryFixture()
      const created = await rpc.sessions.create(undefined)
      expect(created.session).toMatchObject({id: created.sessionId, title: 'New session', lastRunAt: null})
      await rpc.sessions.rename({sessionId, title: 'last run probe'})
      const rows = async () => {
        const listed = (await rpc.sessions.list()).sessions.find((meta: SessionMeta) => meta.id === sessionId)
        const found = (await rpc.sessions.search({term: 'last run probe'})).sessions.find((hit) => hit.id === sessionId)
        const got = await rpc.sessions.get({sessionId})
        return {get: got.lastRunAt, list: listed?.lastRunAt, search: found?.lastRunAt}
      }
      expect(await rows()).toEqual({get: null, list: null, search: null})

      const booted = kit
      if (booted === undefined) throw new Error('the client kit did not boot')
      const turn = await booted.turn('a first run', {session: sessionId, runId: 'last-run-probe'})
      await turn.done()
      const startedAt = (await rpc.chat.hydrate({sessionId})).lastRun?.startedAt
      expect(startedAt).toEqual(expect.any(Number))
      expect(await rows()).toEqual({get: startedAt, list: startedAt, search: startedAt})
    }, 60_000)

    it('a refetch after a rename sees the change (live lists are gone by design)', async () => {
      const {sessionId, rpc, utils, queryClient} = await bootQueryFixture()
      await rpc.sessions.rename({sessionId, title: 'refetch-renamed'})
      await queryClient.invalidateQueries()
      const {sessions} = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
      expect(sessions.map((meta: SessionMeta) => meta.title)).toContain('refetch-renamed')
    })
  })
})

describe('rpc reachability', () => {
  describe('isReachabilityError', () => {
    it('is false for an ORPCError: an expired-session retry is not a reachability signal, the server answered', () => {
      expect(isReachabilityError(new ORPCError('NOT_FOUND'))).toBe(false)
    })

    it('is true for a transport-level failure', () => {
      expect(isReachabilityError(new TypeError('fetch failed'))).toBe(true)
    })
  })

  describe('engine reachability across panels', () => {
    let kit: ClientKit | undefined
    afterEach(async () => {
      await kit?.cleanup()
      kit = undefined
    })

    it('a panel set up after an unreachable engine was disposed starts online and its queries run', async () => {
      const offline = Promise.withResolvers<void>()
      const unsubscribeOnline = onlineManager.subscribe((online) => {
        if (!online) offline.resolve()
      })
      const unreachableBase = 'http://127.0.0.1:9'
      const disposeUnreachable = setupEngineReachability(unreachableBase)
      const unreachable = makeBrowserRpcClient(unreachableBase)
      const call = unreachable.rpc.sessions.list().then(
        () => 'answered',
        () => 'refused',
      )
      await offline.promise
      unsubscribeOnline()
      expect(onlineManager.isOnline()).toBe(false)
      unreachable.close()
      disposeUnreachable()
      expect(await call).toBe('refused')

      kit = await bootClientKit()
      const disposeReachable = setupEngineReachability(kit.base)
      try {
        expect(onlineManager.isOnline()).toBe(true)
        const rpc = makeRpcClient(kit.base)
        const {sessionId} = await rpc.sessions.create(undefined)
        const {sessions} = await new QueryClient().fetchQuery(makeQueryUtils(rpc).sessions.list.queryOptions())
        expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
      } finally {
        disposeReachable()
      }
    }, 20_000)
  })
})

async function collected<T>(source: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = []
  for await (const value of source) seen.push(value)
  return seen
}

function sendTurn(connection: ChatConnection, sessionId: string, runId: string): Promise<void> {
  return connection.send(
    [{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: runId}]}],
    undefined,
    undefined,
    {threadId: sessionId, runId},
  )
}
