import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest'
import {onlineManager, QueryObserver, skipToken} from '@tanstack/query-core'
import {defineConcivPlugin} from '@conciv/extension/devframe-plugin'
import {until} from '@conciv/harness-testkit'
import {serveDevframePlugin} from '@conciv/harness-testkit/devframe-mounts'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {ChatClient} from '@conciv/ai/testkit'
import {makeRpcClient, type RpcClient, type SessionMeta} from '@conciv/contract'
import {chatConnection, type ChatConnection, type ChatTransport} from '../src/chat-connection.js'
import {bootClientKit, type ClientKit} from './helpers.js'
import {createServer, type Server} from 'node:http'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import {type ChatEvent, ChatEventType} from '@conciv/protocol/chat-event-types'
import {acquirePushChannel, livePushChannelCount, type PageQueryFrame} from '../src/push-channel.js'
import {MutationObserver, QueryClient} from '@tanstack/solid-query'
import {hubQueryUtils, makeQueryUtils, type HubCall} from '../src/query-utils.js'
import {ORPCError} from '@orpc/client'
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

  const textOf = (message: ChatMessage): string =>
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
            .map(textOf)
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
        expect((await hydrated.promise).some((message) => textOf(message).includes('started elsewhere'))).toBe(true)
        clientKit.gate.release()
        await settled.promise
      } finally {
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

  async function turnOf(runId: string, parts: ChatMessage['parts'], extra: ChatMessage[] = []) {
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

  function settledTransport(): {chosen: Promise<ChatTransport>; settle: (transport: ChatTransport) => void} {
    const held: {settle: (transport: ChatTransport) => void} = {settle: () => {}}
    const chosen = new Promise<ChatTransport>((resolve) => {
      held.settle = resolve
    })
    return {chosen, settle: (transport) => held.settle(transport)}
  }

  describe('chatConnection', () => {
    it('carries the run it starts and leaves the assistant reply on the thread', async () => {
      const {seen, thread} = await turnOf('chat-connection-1', [{type: 'text', content: 'hello'}])

      expect(seen.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      expect(thread).toContain('"role":"assistant"')
    }, 60_000)

    it('sends only the LAST user message as the turn', async () => {
      const {thread} = await turnOf(
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
      const {thread} = await turnOf('chat-connection-3', [
        {type: 'text', content: 'describe this'},
        {type: 'image', source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'}},
      ])

      expect(thread).toContain('describe this')
      expect(thread).toContain('aGVsbG8=')
      expect(thread).toContain('image/png')
    }, 60_000)

    it('picks the websocket when one opens and the fetch event stream when it does not', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      const rpc = makeRpcClient(clientKit.base)

      const settledOpen = settledTransport()
      const auto = chatConnection(rpc, clientKit.base, sessionId, {
        probeTimeoutMs: 5_000,
        onTransport: settledOpen.settle,
      })
      expect(await settledOpen.chosen).toBe('websocket')
      expect(auto.transport()).toBe('websocket')

      const settledBlocked = settledTransport()
      const blocked = chatConnection(rpc, 'http://127.0.0.1:9', sessionId, {
        probeTimeoutMs: 500,
        onTransport: settledBlocked.settle,
      })
      expect(await settledBlocked.chosen).toBe('fetch')
      expect(blocked.transport()).toBe('fetch')
    }, 60_000)
  })

  describe('chatConnection streams', () => {
    it('a stream that breaks mid-turn ends the turn with an error and stops streaming', async () => {
      const server = await breakingEventsServer()
      const errors: Error[] = []
      const client = new ChatClient({
        connection: chatConnection(makeRpcClient(server.base), server.base, 'conciv_breaking', {transport: 'fetch'}),
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

    it('aborting a live subscription ends it cleanly, with no error', async () => {
      const {sessionId, connection} = await opened()
      const watcher = watch(connection)
      await sendTurn(connection, sessionId, 'abort-1')
      await watcher.finished
      watcher.abort()
      await expect(watcher.ended).resolves.toBeUndefined()
    }, 30_000)

    it('on the fetch transport every subscriber gets each chunk, and one that aborts stops receiving', async () => {
      const clientKit = await bootClientKit()
      kit = clientKit
      const sessionId = await clientKit.session()
      const connection = chatConnection(makeRpcClient(clientKit.base), clientKit.base, sessionId, {transport: 'fetch'})
      const [staying, leaving] = [watch(connection), watch(connection)]
      await sendTurn(connection, sessionId, 'fan-out-1')
      await Promise.all([staying.finished, leaving.finished])
      expect(leaving.seen.map((chunk) => chunk.type)).toEqual(staying.seen.map((chunk) => chunk.type))
      const before = leaving.seen.length
      leaving.abort()
      await leaving.ended
      await sendTurn(connection, sessionId, 'fan-out-2')
      expect(leaving.seen).toHaveLength(before)
      expect(staying.seen.length).toBeGreaterThan(before)
      staying.abort()
    }, 30_000)
  })

  async function breakingEventsServer(): Promise<{base: string; close: () => Promise<void>}> {
    const run = {threadId: 'conciv_breaking', runId: 'breaking-run'}
    const frames = [
      {type: ChatEventType.RUN_STARTED, ...run},
      {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'broken-reply', role: 'assistant'},
      {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'broken-reply', delta: 'half a rep'},
    ]
    const server: Server = createServer((request, response) => {
      if (request.method !== 'POST' || !request.url?.endsWith(CHAT_SSE_PATH)) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {'content-type': 'text/event-stream'})
      response.write(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''), () => response.destroy())
    })
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    return {
      base: `http://127.0.0.1:${port}`,
      close: () => new Promise((closed) => server.close(() => closed())),
    }
  }

  function watch(connection: ChatConnection) {
    const abort = new AbortController()
    const seen: ChatEvent[] = []
    const finished = Promise.withResolvers<void>()
    const ended = (async () => {
      for await (const chunk of connection.subscribe(abort.signal)) {
        seen.push(chunk)
        if (chunk.type === ChatEventType.RUN_FINISHED) finished.resolve()
      }
    })()
    return {seen, finished: finished.promise, ended, abort: () => abort.abort()}
  }

  function sendTurn(connection: ChatConnection, sessionId: string, runId: string): Promise<void> {
    return connection.send(
      [{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: runId}]}],
      undefined,
      undefined,
      {
        threadId: sessionId,
        runId,
      },
    )
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
      await elsewhere.done({hangGuardMs: 20_000})

      expect(userTexts((await connection.refresh()).messages)).toContain('led from the server')
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

describe('push channel', () => {
  const SETTLE_MS = 150
  const RECONNECT_MS = 1500

  let kit: ClientKit | undefined

  afterEach(async () => {
    await kit?.cleanup()
    kit = undefined
  })

  async function bootWithChannel() {
    const booted = await bootClientKit()
    kit = booted
    const sessionId = await booted.session()
    const abort = new AbortController()
    const channel = acquirePushChannel({apiBase: booted.base, sessionId})
    return {booted, sessionId, channel, abort}
  }

  function settled(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function nextQuery(source: AsyncIterable<PageQueryFrame>): Promise<PageQueryFrame> {
    for await (const frame of source) return frame
    throw new Error('the push channel closed before a page query arrived')
  }

  describe('the per-tab push socket', () => {
    it('carries a page query to the tab and the reply resolves the caller', async () => {
      const {booted, channel, abort} = await bootWithChannel()
      const arriving = nextQuery(channel.queries(abort.signal))
      await settled(SETTLE_MS)
      const calling = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})

      const frame = await arriving
      await booted.rpc.page.reply({requestId: frame.requestId, outcome: {ok: true, result: {text: 'body text'}}})

      expect(await calling).toEqual({text: 'body text'})
      abort.abort()
      channel.dispose()
    })

    it('reopens itself after the engine restarts and serves page queries again', async () => {
      const {booted, channel, abort} = await bootWithChannel()
      const warming = nextQuery(channel.queries(abort.signal))
      await settled(SETTLE_MS)
      const warmup = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})
      const warmupFrame = await warming
      await booted.rpc.page.reply({requestId: warmupFrame.requestId, outcome: {ok: true, result: {text: 'before'}}})
      expect(await warmup).toEqual({text: 'before'})

      await booted.restartServer()
      const seen: PageQueryFrame[] = []
      const collecting = (async () => {
        for await (const frame of channel.queries(abort.signal)) seen.push(frame)
      })()
      await settled(RECONNECT_MS)
      const calling = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})
      await expect.poll(() => seen.length, {timeout: 5_000}).toBe(1)
      const frame = seen[0]
      if (!frame) throw new Error('the reconnected channel served no page query')
      await booted.rpc.page.reply({requestId: frame.requestId, outcome: {ok: true, result: {text: 'after'}}})

      expect(await calling).toEqual({text: 'after'})
      expect(seen).toHaveLength(1)
      abort.abort()
      await collecting
      channel.dispose()
    })

    it('hands the page plane and the chat stream the same socket for one session', async () => {
      const {booted, sessionId, channel, abort} = await bootWithChannel()
      const opened = livePushChannelCount()
      const second = acquirePushChannel({apiBase: booted.base, sessionId})

      expect(livePushChannelCount()).toBe(opened)
      second.dispose()
      expect(livePushChannelCount()).toBe(opened)

      abort.abort()
      channel.dispose()
      expect(livePushChannelCount()).toBe(opened - 1)
    })
  })
})

describe('hub-backed query utils', () => {
  const sessionsProbe = defineConcivPlugin({id: 'query-probe', title: 'Query probe'}).server((ctx) => {
    ctx.rpc.register({name: 'conciv:sessions:list', type: 'query', handler: () => [{id: 'from-hub'}]})
    ctx.rpc.register({name: 'conciv:sessions:create', type: 'action', handler: () => ({sessionId: 'created-on-hub'})})
  })

  const hubCall =
    (kit: ClientKit): HubCall =>
    (name, input) =>
      kit.hub.connection.ready().then(({rpc}) => rpc.$callRaw({method: name, args: [input]}))

  let kit: ClientKit

  beforeAll(async () => {
    kit = await bootClientKit({plugins: [sessionsProbe]})
  })

  afterAll(() => kit.cleanup())

  it('sends a listed group through the hub and keeps the query keys of the oRPC utils', async () => {
    const plain = makeQueryUtils(kit.rpc)
    const utils = hubQueryUtils(plain, hubCall(kit), new Set(['sessions']))
    const options = utils.sessions.list.queryOptions({input: {includeHidden: false}})
    expect(options.queryKey).toEqual(plain.sessions.list.queryOptions({input: {includeHidden: false}}).queryKey)
    expect(utils.sessions.list.key()).toEqual(plain.sessions.list.key())
    const client = new QueryClient()
    expect(await client.fetchQuery(options)).toEqual([{id: 'from-hub'}])
  })

  it('keeps a listed query disabled while its input is skipToken, even on an explicit refetch', async () => {
    const utils = hubQueryUtils(makeQueryUtils(kit.rpc), hubCall(kit), new Set(['sessions']))
    const observer = new QueryObserver(new QueryClient(), {
      ...utils.sessions.list.queryOptions({input: skipToken}),
      retry: false,
    })
    const stop = observer.subscribe(() => {})
    expect(observer.getCurrentResult().fetchStatus).toBe('idle')
    const refetched = await observer.refetch()
    expect(refetched.error?.message).toMatch(/skipToken/)
    stop()
  })

  it('sends a mutation of a listed group through the hub', async () => {
    const utils = hubQueryUtils(makeQueryUtils(kit.rpc), hubCall(kit), new Set(['sessions']))
    const options = utils.sessions.create.mutationOptions()
    const client = new QueryClient()
    const observer = new MutationObserver(client, options)
    expect(await observer.mutate({})).toEqual({sessionId: 'created-on-hub'})
  })

  it('leaves an unlisted group on oRPC', async () => {
    const utils = hubQueryUtils(makeQueryUtils(kit.rpc), hubCall(kit), new Set())
    const client = new QueryClient()
    const listed = await client.fetchQuery(utils.sessions.list.queryOptions({input: {includeHidden: true}}))
    expect(listed).not.toEqual([{id: 'from-hub'}])
  })
})

describe('reachability from a hub connection', () => {
  const noopHub = defineConcivPlugin({id: 'reach-probe', title: 'Reach probe'})

  it('takes the engine offline when the hub connection drops and back when it reconnects', async () => {
    const served = await serveDevframePlugin(noopHub.devframe)
    const dispose = setupEngineReachability('http://127.0.0.1:1', served.client.connection)
    const seen: boolean[] = []
    const stopWatching = onlineManager.subscribe((online) => seen.push(online))
    await served.client.connection.ready()
    await served.hub.close()
    await until(() => seen.includes(false))
    await until(() => seen.at(-1) === true)
    stopWatching()
    dispose()
    onlineManager.setOnline(true)
    await served.close()
  }, 10_000)
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
      const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
      expect(sessions.map((meta: SessionMeta) => meta.id)).toContain(sessionId)
      const models = await queryClient.fetchQuery(utils.meta.models.queryOptions())
      expect(models.harness.id).toBe('fake-client')
    })

    it('mutationOptions execute intents', async () => {
      const {sessionId, utils, queryClient} = await bootQueryFixture()
      const rename = new MutationObserver(queryClient, utils.sessions.rename.mutationOptions())
      const renamed = await rename.mutate({sessionId, title: 'named by mutation'})
      expect(renamed.title).toBe('named by mutation')
    })

    it('a refetch after a rename sees the change (live lists are gone by design)', async () => {
      const {sessionId, rpc, utils, queryClient} = await bootQueryFixture()
      await rpc.sessions.rename({sessionId, title: 'refetch-renamed'})
      await queryClient.invalidateQueries()
      const sessions = await queryClient.fetchQuery(utils.sessions.list.queryOptions())
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
})
