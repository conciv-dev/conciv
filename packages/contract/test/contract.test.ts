import {describe, expect, expectTypeOf, it, afterAll, beforeAll, onTestFinished} from 'vitest'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from '../src/rows.js'
import {SocketTrustFrameSchema} from '../src/contract.js'
import type {SessionMeta} from '../src/rows.js'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient} from '../src/client.js'
import {createServer, type Server} from 'node:http'
import {createHash} from 'node:crypto'
import {EventEmitter, once} from 'node:events'
import type {Duplex} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import {decodeRequestMessage, encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import {ORPCError} from '@orpc/client'
import {browserRpcConnection, normalizeApiBase} from '../src/browser-transport.js'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import type {HarnessListCursor} from '@conciv/protocol/harness-types'
import contractManifest from '../package.json' with {type: 'json'}
import {mergeSettings} from '../src/settings.js'
import {Effect, Layer, Option, Scope, Stream, SubscriptionRef} from 'effect'
import {Socket} from 'effect/socket'
import {TestClock} from 'effect/testing'
import {createORPCClient} from '@orpc/client'
import type {ContractRouterClient} from '@orpc/contract'
import {contract} from '../src/contract.js'
import {makeEngineConnection, type RpcClientContext} from '../src/engine-connection.js'
import {
  createConnectionState,
  defaultEngineConnectionTimings,
  reconnectDelay,
  transitionConnection,
  type ConnectionEffect,
  type ConnectionEvent,
} from '../src/engine-connection-machine.js'

describe('client', () => {
  describe('makeRpcClient', () => {
    it('builds a typed client rooted at <apiBase>/rpc', async () => {
      const requests: string[] = []
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        requests.push(new Request(input, init).url)
        return new Response(JSON.stringify({json: {sessions: [], next: null}}), {
          headers: {'content-type': 'application/json'},
        })
      }
      try {
        const client = makeRpcClient('http://conciv.test')
        await client.sessions.list(undefined)
        expect(requests[0]).toContain('http://conciv.test/rpc/sessions/list')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('is typed by the contract', () => {
      expectTypeOf<Awaited<ReturnType<RpcClient['sessions']['list']>>>().toEqualTypeOf<{
        sessions: SessionMeta[]
        next: HarnessListCursor | null
      }>()
    })
  })

  describe('makeBrowserRpcClient', () => {
    it('is bound immediately when constructed with a plain base string', () => {
      const client = makeBrowserRpcClient('http://127.0.0.1:1')
      expect(client.bound()).toBe(true)
      client.close()
    })

    it('starts unbound when constructed with a null-returning accessor, and rejects calls with the current message until bound', async () => {
      const client = makeBrowserRpcClient(() => null)
      expect(client.bound()).toBe(false)
      await expect(client.rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
      client.bind('http://127.0.0.1:1')
      expect(client.bound()).toBe(true)
      client.close()
    })

    it('throws on double bind', () => {
      const client = makeBrowserRpcClient(() => null)
      client.bind('http://127.0.0.1:1')
      expect(() => client.bind('http://127.0.0.1:2')).toThrow()
      client.close()
    })

    it('rejects an empty api base and keeps bound() false so a later bind is not silently swallowed', () => {
      const client = makeBrowserRpcClient(() => null)
      expect(() => client.bind('')).toThrow()
      expect(client.bound()).toBe(false)
      client.bind('http://127.0.0.1:1')
      expect(client.bound()).toBe(true)
      client.close()
    })

    it('rebind closes the previous connection and moves the client onto the new base', () => {
      const client = makeBrowserRpcClient('http://127.0.0.1:1')
      expect(client.bound()).toBe(true)
      client.rebind('http://127.0.0.1:2')
      expect(client.bound()).toBe(true)
      client.close()
    })

    it('rejects calls after close instead of resurrecting the connection', async () => {
      const client = makeBrowserRpcClient('http://127.0.0.1:1')
      client.close()
      expect(client.bound()).toBe(false)
      await expect(client.rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
    })

    it('close is idempotent: calling it twice does not throw', () => {
      const client = makeBrowserRpcClient('http://127.0.0.1:1')
      client.close()
      expect(() => client.close()).not.toThrow()
    })

    it('re-reads a caller-supplied base accessor on every call instead of freezing it at construction', () => {
      let currentBase: string | null = 'http://127.0.0.1:1'
      const client = makeBrowserRpcClient(() => currentBase)
      expect(client.bound()).toBe(true)
      currentBase = 'http://127.0.0.1:2'
      expect(client.bound()).toBe(true)
      currentBase = null
      expect(client.bound()).toBe(false)
      client.close()
    })
  })
})

describe('rows', () => {
  describe('row schemas', () => {
    it('parses a session meta', () => {
      const parsed = SessionMetaSchema.parse({
        id: 'conciv_1',
        title: 'hello',
        updatedAt: 1,
        sizeBytes: 0,
        running: false,
        origin: 'conciv',
        usage: null,
        model: null,
        effort: null,
        hidden: false,
        native: null,
        harnessKind: 'claude',
        lastRunAt: null,
      })
      expect(parsed.hidden).toBe(false)
      expect(parsed.effort).toBeNull()
      expect(parsed.lastRunAt).toBeNull()
    })

    it('a session meta says when its newest run started, and a row without that fact is refused', () => {
      const meta = {
        id: 'conciv_1',
        title: 'hello',
        updatedAt: 1,
        running: false,
        origin: 'conciv',
        usage: null,
        model: null,
        effort: null,
        hidden: false,
        native: null,
        harnessKind: 'claude',
      }
      expect(SessionMetaSchema.parse({...meta, lastRunAt: 1_700}).lastRunAt).toBe(1_700)
      expect(SessionMetaSchema.safeParse(meta).success).toBe(false)
    })

    it('rejects an unknown marker kind', () => {
      expect(() =>
        MarkerRowSchema.parse({id: 'm1', sessionId: 'conciv_1', afterMessageId: 'msg-1', kind: 'weird'}),
      ).toThrow()
    })

    it('drafts are explicit about selection and default their attachments', () => {
      const draft = DraftRowSchema.parse({
        sessionId: 'conciv_1',
        text: 'hi',
        selectionStart: 2,
        selectionEnd: 2,
        updatedAt: 5,
      })
      expect(draft.selectionEnd).toBe(2)
      expect(draft.attachments).toEqual([])
    })
  })
})

describe('node rpc client', () => {
  const versions: (string | null)[] = []

  let server: Server
  let base = ''

  beforeAll(async () => {
    server = createServer((request, response) => {
      const version = request.headers[CONCIV_VERSION_HEADER]
      versions.push(typeof version === 'string' ? version : null)
      request.resume()
      request.on('end', () => {
        response.writeHead(200, {'content-type': 'application/json'})
        response.end(JSON.stringify({json: {sessions: [], next: null}, meta: []}))
      })
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('the node rpc client tells the engine the contract release version', async () => {
    await makeRpcClient(base).sessions.list(undefined)

    expect(versions).toEqual([contractManifest.version])
  }, 15_000)
})

describe('browser rpc socket closing under a cancelled call', () => {
  it('a call cancelled while the socket is closing settles once the socket closes, with no unhandled rejection', async () => {
    const peer = await closingHandshakeServer()
    const client = makeBrowserRpcClient(peer.base)
    try {
      const cancel = new AbortController()
      const call = client.rpc.sessions.resolve({}, {signal: cancel.signal})
      const settled = call.then(
        () => 'resolved',
        () => 'rejected',
      )
      await peer.framesSeen(TEXT_OPCODE, 2)
      peer.startClosing()
      await peer.framesSeen(CLOSE_OPCODE, 1)
      cancel.abort()
      peer.finishClosing()
      expect(await settled).toBe('rejected')
    } finally {
      client.close()
      await peer.close()
    }
  }, 15_000)

  it('a call cancelled in the same task that releases the connection settles with no unhandled rejection', async () => {
    const peer = await closingHandshakeServer()
    const client = makeBrowserRpcClient(peer.base)
    try {
      const cancel = new AbortController()
      const settled = client.rpc.sessions.resolve({}, {signal: cancel.signal}).then(
        () => 'resolved',
        () => 'rejected',
      )
      await peer.framesSeen(TEXT_OPCODE, 2)
      cancel.abort()
      client.close()
      expect(await settled).toBe('rejected')
    } finally {
      await peer.close()
    }
  }, 15_000)
})

describe('browser rpc calls cancelled before the socket opens', () => {
  it('a call cancelled while its connection attempt is held is never sent once the socket opens', async () => {
    const peer = await closingHandshakeServer()
    peer.holdUpgrades()
    const client = makeBrowserRpcClient(peer.base)
    try {
      const cancel = new AbortController()
      const cancelled = client.rpc.sessions.resolve({}, {signal: cancel.signal}).then(
        () => 'resolved',
        () => 'rejected',
      )
      await peer.upgradeHeld()
      cancel.abort()
      const later = client.rpc.meta.harnesses().then(
        () => 'resolved',
        () => 'rejected',
      )
      peer.releaseUpgrades()
      await peer.requestSeen('/meta/harnesses')
      expect(peer.requestPaths().filter((path) => path.endsWith('/sessions/resolve'))).toEqual([])
      expect(await cancelled).toBe('rejected')
      client.close()
      expect(await later).toBe('rejected')
    } finally {
      client.close()
      await peer.close()
    }
  }, 15_000)
})

describe('browser rpc calls whose caller decides the retry', () => {
  it('a call with its own shouldRetry stops retrying once its connection is released', async () => {
    const vacant = createServer()
    await new Promise<void>((resolve) => vacant.listen(0, '127.0.0.1', resolve))
    const address = vacant.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    await new Promise((resolve) => vacant.close(resolve))
    const client = makeBrowserRpcClient(`http://127.0.0.1:${port}`)
    const asks = [Promise.withResolvers<string>(), Promise.withResolvers<string>()]
    const asked = {count: 0}
    const shouldRetry = () => {
      asks[asked.count]?.resolve(`asked ${asked.count + 1} times`)
      asked.count += 1
      return true
    }
    const call = client.rpc.sessions.resolve({}, {context: {shouldRetry}})
    await asks[0]?.promise
    client.close()
    const settled = call.then(
      () => 'resolved',
      () => 'rejected',
    )
    expect(await Promise.race([settled, asks[1]?.promise])).toBe('rejected')
    expect(asked.count).toBe(1)
  }, 15_000)
})

describe('browser rpc frames that cannot be delivered or read', () => {
  it('a call whose request meets a socket that is not open rejects with the socket error', async () => {
    const vacant = createServer()
    await new Promise<void>((resolve) => vacant.listen(0, '127.0.0.1', resolve))
    const address = vacant.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    await new Promise((resolve) => vacant.close(resolve))
    const client = makeBrowserRpcClient(`http://127.0.0.1:${port}`)
    try {
      await expect(client.rpc.sessions.resolve({})).rejects.toThrow('Cannot send message, WebSocket is not open.')
    } finally {
      client.close()
    }
  }, 15_000)

  it('a frame the client cannot read fails the call in flight instead of an unhandled rejection', async () => {
    const peer = await closingHandshakeServer()
    peer.answerRequestsWith('not an rpc frame')
    const client = makeBrowserRpcClient(peer.base)
    try {
      await expect(client.rpc.sessions.resolve({})).rejects.toBeInstanceOf(SyntaxError)
    } finally {
      client.close()
      await peer.close()
    }
  }, 15_000)
})

describe('browser rpc streams after the token is replaced', () => {
  it('a stream opened before the token was replaced that the engine refuses shows the log-in notice with no socket close', async () => {
    const peer = await closingHandshakeServer()
    const client = makeBrowserRpcClient(peer.base)
    const {trust, release} = browserRpcConnection(peer.base)
    const answerTrust = async (count: number): Promise<void> => {
      const id = await peer.requestId('/auth/trust', count)
      const body = {json: {trusted: true}, meta: []}
      await peer.reply(id, encodeResponseMessage(id, MessageType.RESPONSE, {status: 200, headers: {}, body}))
    }
    try {
      const first = trust.requestTrustWithToken('first')
      await answerTrust(1)
      expect(await first).toBe(true)
      const events = client.rpc.chat.events({sessionId: 'session'})
      const streamId = await peer.requestId('/chat/events', 1)
      await peer.reply(
        streamId,
        encodeResponseMessage(streamId, MessageType.RESPONSE, {status: 200, headers: {}, body: noEvents()}),
      )
      const stream = await events
      const second = trust.requestTrustWithToken('second')
      await answerTrust(2)
      expect(await second).toBe(true)
      const next = stream.next()
      await peer.reply(
        streamId,
        encodeResponseMessage(streamId, MessageType.EVENT_ITERATOR, {
          event: 'error',
          data: {json: {defined: false, code: 'UNAUTHORIZED', status: 401, message: 'no longer trusted'}, meta: []},
        }),
      )

      await expect(next).rejects.toBeInstanceOf(ORPCError)
      expect(trust.status()).toBe('revoked')
    } finally {
      release()
      client.close()
      await peer.close()
    }
  }, 15_000)
})

const TEXT_OPCODE = 1
const CLOSE_OPCODE = 8
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const NORMAL_CLOSE_FRAME = Buffer.from([0x88, 0x02, 0x03, 0xe8])

type ClosingHandshakeServer = {
  base: string
  framesSeen: (opcode: number, count: number) => Promise<void>
  answerRequestsWith: (text: string) => void
  startClosing: () => void
  finishClosing: () => void
  holdUpgrades: () => void
  upgradeHeld: () => Promise<void>
  releaseUpgrades: () => void
  requestSeen: (path: string) => Promise<void>
  requestPaths: () => readonly string[]
  requestId: (path: string, count: number) => Promise<string>
  reply: (id: string, message: Promise<string | ArrayBufferLike | Uint8Array>) => Promise<void>
  close: () => Promise<void>
}

type SeenRequest = {path: string; id: string; socket: Duplex}

type MaskedFrame = {opcode: number; payload: Buffer}

async function closingHandshakeServer(): Promise<ClosingHandshakeServer> {
  const frames = new EventEmitter()
  const seen: number[] = []
  const sockets: Duplex[] = []
  const answer: {text: string | undefined} = {text: undefined}
  const requests: SeenRequest[] = []
  const failures: unknown[] = []
  const decoding = {tail: Promise.resolve()}
  const upgrades: {held: boolean; waiting: (() => void)[]} = {held: false, waiting: []}
  const recordRequest = (payload: Buffer, socket: Duplex): void => {
    const text = payload.toString()
    decoding.tail = decoding.tail
      .then(async () => {
        if (SocketTrustFrameSchema.safeParse(JSON.parse(text)).success) return
        const message = await decodeRequestMessage(text)
        if (message[1] !== MessageType.REQUEST) return
        requests.push({path: message[2].url.pathname, id: message[0], socket})
        frames.emit('request')
      })
      .catch((error: unknown) => {
        failures.push(error)
        frames.emit('request')
      })
  }
  const decodeFailure = (): Error | undefined =>
    failures.length === 0
      ? undefined
      : new Error('the test server could not decode a frame the client sent', {cause: failures[0]})
  const acceptUpgrade = (request: IncomingMessage, socket: Duplex): void => {
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}${WEBSOCKET_GUID}`)
      .digest('base64')
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    const pending = {buffer: Buffer.alloc(0)}
    socket.on('data', (chunk: Buffer) => {
      pending.buffer = Buffer.concat([pending.buffer, chunk])
      for (const {opcode, payload} of takeMaskedFrames(pending)) {
        seen.push(opcode)
        if (opcode === TEXT_OPCODE) recordRequest(payload, socket)
        if (
          answer.text !== undefined &&
          opcode === TEXT_OPCODE &&
          seen.filter((each) => each === TEXT_OPCODE).length > 1
        ) {
          socket.write(textFrame(answer.text))
        }
        frames.emit('frame')
      }
    })
  }
  const server = createServer()
  server.on('upgrade', (request, socket) => {
    sockets.push(socket)
    if (!upgrades.held) {
      acceptUpgrade(request, socket)
      return
    }
    upgrades.waiting.push(() => acceptUpgrade(request, socket))
    frames.emit('held')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const requestSeen = async (path: string, count: number): Promise<SeenRequest> => {
    for (;;) {
      const failure = decodeFailure()
      if (failure) throw failure
      const found = requests.filter((each) => each.path.endsWith(path))[count - 1]
      if (found) return found
      await once(frames, 'request')
    }
  }
  const framesSeen = async (opcode: number, count: number): Promise<void> => {
    while (seen.filter((each) => each === opcode).length < count) await once(frames, 'frame')
  }
  return {
    base: `http://127.0.0.1:${port}`,
    framesSeen,
    answerRequestsWith: (text) => {
      answer.text = text
    },
    startClosing: () => {
      for (const socket of sockets) socket.write(NORMAL_CLOSE_FRAME)
    },
    finishClosing: () => {
      for (const socket of sockets) socket.end()
    },
    holdUpgrades: () => {
      upgrades.held = true
    },
    upgradeHeld: async () => {
      while (upgrades.waiting.length === 0) await once(frames, 'held')
    },
    releaseUpgrades: () => {
      upgrades.held = false
      for (const release of upgrades.waiting.splice(0)) release()
    },
    requestSeen: async (path) => {
      await requestSeen(path, 1)
    },
    requestPaths: () => {
      const failure = decodeFailure()
      if (failure) throw failure
      return requests.map((each) => each.path)
    },
    requestId: async (path, count) => (await requestSeen(path, count)).id,
    reply: async (id, message) => {
      const encoded = await message
      if (typeof encoded !== 'string') throw new Error('the test server writes text frames only')
      const request = requests.find((each) => each.id === id)
      if (!request) throw new Error(`the test server saw no request ${id}`)
      request.socket.write(textFrame(encoded))
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

async function* noEvents(): AsyncGenerator<never> {}

function textFrame(text: string): Buffer {
  const payload = Buffer.from(text)
  const length =
    payload.length < 126
      ? Buffer.from([payload.length])
      : Buffer.from([126, payload.length >> 8, payload.length & 0xff])
  return Buffer.concat([Buffer.from([0x81]), length, payload])
}

function takeMaskedFrames(pending: {buffer: Buffer}): MaskedFrame[] {
  const {buffer} = pending
  if (buffer.length < 2) return []
  const shortLength = buffer.readUInt8(1) & 0x7f
  const headerLength = shortLength === 126 ? 8 : 6
  if (buffer.length < headerLength) return []
  const payloadLength = shortLength === 126 ? buffer.readUInt16BE(2) : shortLength
  if (buffer.length < headerLength + payloadLength) return []
  pending.buffer = buffer.subarray(headerLength + payloadLength)
  const mask = buffer.subarray(headerLength - 4, headerLength)
  const payload = Buffer.from(
    buffer.subarray(headerLength, headerLength + payloadLength).map((byte, index) => byte ^ (mask[index % 4] ?? 0)),
  )
  return [{opcode: buffer.readUInt8(0) & 0x0f, payload}, ...takeMaskedFrames(pending)]
}

describe('settings', () => {
  it('merges project over global: arrays replace, records merge per key, missing and null fall through', () => {
    const global = {
      skin: 'terminal',
      launcher: 'hidden',
      docksHidden: ['notes', 'terminal'],
      commandShortcuts: {togglePanel: ['Mod+J'], quickTerminal: ['Mod+T']},
    }
    const project = {launcher: null, docksHidden: ['files'], commandShortcuts: {quickTerminal: ['Mod+K']}}
    expect(mergeSettings(project, global)).toEqual({
      skin: 'terminal',
      launcher: 'hidden',
      docksHidden: ['files'],
      commandShortcuts: {togglePanel: ['Mod+J'], quickTerminal: ['Mod+K']},
    })
    expect(mergeSettings({}, global)).toEqual(global)
  })
})

describe('engine connection machine', () => {
  const summary = (effect: ConnectionEffect): string =>
    effect.type === 'publish' ? `publish:${Object.values(effect.signal).join(':')}` : Object.values(effect).join(':')

  it('replays the back-off and its cap, the uptime reset, a revocation, the reopen on the next call and disposal', () => {
    expect(
      [-1, 0, 1, 2, 3, 9, 40].map((retries) => reconnectDelay(retries, defaultEngineConnectionTimings)).map(Math.round),
    ).toEqual([0, 0, 250, 325, 423, 2000, 2000])
    const lost = ['publish:reachable:false', 'close-peer']
    const revoked = ['forget-token:held', 'publish:status:revoked:trusted', 'close-peer']
    const up = (attempt: number) => ['send-trust-frame:held', `schedule-uptime:${attempt}`, 'publish:reachable:true']
    const replay: [ConnectionEvent, string[]][] = [
      [{type: 'unauthorized', token: undefined}, []],
      [{type: 'trusted', token: 'held'}, ['store-token:held', 'publish:status:trusted:checking']],
      [{type: 'call-started'}, ['schedule-retry:1:0']],
      [{type: 'retry-due', attempt: 1}, ['open-socket:1']],
      [{type: 'socket-closed', attempt: 1, code: 1006}, ['schedule-retry:2:250', ...lost]],
      [{type: 'retry-due', attempt: 2}, ['open-socket:2']],
      [{type: 'socket-opened', attempt: 2}, up(2)],
      [{type: 'uptime-reached', attempt: 2}, []],
      [{type: 'socket-closed', attempt: 2, code: 1006}, ['schedule-retry:3:250', ...lost]],
      [{type: 'call-started'}, []],
      [{type: 'retry-due', attempt: 3}, ['open-socket:3']],
      [{type: 'socket-opened', attempt: 3}, up(3)],
      [{type: 'socket-closed', attempt: 3, code: 1008}, revoked],
      [{type: 'retry-due', attempt: 3}, []],
      [{type: 'unauthorized', token: undefined}, []],
      [{type: 'trust-refused', token: 'other'}, ['forget-token:other']],
      [{type: 'call-started'}, ['schedule-retry:4:0']],
      [{type: 'disposed'}, ['close-socket', 'close-peer']],
      [{type: 'call-started'}, []],
    ]
    const replayed = replay.reduce(
      (folded, [event]) => {
        const next = transitionConnection(folded.state, event)
        return {state: next.state, steps: [...folded.steps, next.effects.map(summary)]}
      },
      {state: createConnectionState(undefined), steps: new Array<string[]>()},
    )
    expect(replayed.steps).toEqual(replay.map(([, steps]) => steps))
  })
})
type FakeSocket = Socket.WebSocketLike & {
  readonly frames: (string | Uint8Array)[]
  readonly open: () => void
  readonly drop: (code: number) => void
  readonly closing: () => void
  readonly receive: (data: string) => void
}
function waitFor<A, B>(ref: SubscriptionRef.SubscriptionRef<A>, pick: (value: A) => B | undefined) {
  return SubscriptionRef.changes(ref).pipe(
    Stream.map(pick),
    Stream.filter((value) => value !== undefined),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  )
}
function recorded<A>() {
  const seen = Effect.runSync(SubscriptionRef.make<readonly A[]>([]))
  return {
    push: (value: A): void => Effect.runSync(SubscriptionRef.update(seen, (list) => [...list, value])),
    reached: (length: number) => waitFor(seen, (list) => (list.length >= length ? list : undefined)),
    touch: () => Effect.runSync(SubscriptionRef.update(seen, (list) => [...list])),
    seen,
  }
}
function fakeEngine() {
  const sockets = recorded<FakeSocket>()
  const create = (): FakeSocket => {
    const events = new EventTarget()
    const live = {readyState: 0}
    const emit = (readyState: number, event: Event): void => {
      live.readyState = readyState
      events.dispatchEvent(event)
    }
    const socket: FakeSocket = {
      get readyState() {
        return live.readyState
      },
      frames: [],
      addEventListener: (type, listener, options) => events.addEventListener(type, listener, options),
      removeEventListener: (type, listener) => events.removeEventListener(type, listener),
      close: () => emit(3, new Event('closed')),
      send: (data) => {
        socket.frames.push(data)
        sockets.touch()
      },
      open: () => emit(1, new Event('open')),
      drop: (code) => emit(3, new CloseEvent('close', {code})),
      closing: () => emit(2, new Event('closing')),
      receive: (data) => events.dispatchEvent(new MessageEvent('message', {data})),
    }
    sockets.push(socket)
    return socket
  }
  const socketAt = (index: number) => waitFor(sockets.seen, (list) => list[index])
  const framesOn = (index: number, count: number) =>
    waitFor(sockets.seen, (list) => ((list[index]?.frames.length ?? 0) >= count ? list[index]?.frames : undefined))
  const requestsOn = (index: number, count: number) =>
    framesOn(index, count + 1).pipe(
      Effect.flatMap((frames) => Effect.promise(() => Promise.all(frames.slice(1).map(decodeRequestMessage)))),
    )
  const requestOn = (index: number, frame: number) =>
    requestsOn(index, frame).pipe(Effect.map((requests) => requests[frame - 1] ?? [undefined, undefined, undefined]))
  const pathsOn = (index: number, count: number) =>
    requestsOn(index, count).pipe(
      Effect.map((requests) => requests.map(([, , payload]) => String(Reflect.get(Object(payload), 'url')))),
    )
  const reply = (index: number, id: string | undefined, body: unknown, status = 200) =>
    Effect.flatMap(socketAt(index), (socket) =>
      Effect.promise(async () =>
        socket.receive(
          String(await encodeResponseMessage(String(id), MessageType.RESPONSE, {status, headers: {}, body})),
        ),
      ),
    )
  const answer = (index: number, id: string | undefined, json: unknown) => reply(index, id, {json, meta: []})
  const count = SubscriptionRef.get(sockets.seen).pipe(Effect.map((list) => list.length))
  const layer = Layer.succeed(Socket.WebSocketConstructor)(create)
  return {socketAt, framesOn, requestOn, pathsOn, reply, answer, count, layer}
}
const clocked = (body: () => Generator<Effect.Effect<unknown, unknown, Scope.Scope>, void, never>) =>
  Effect.runPromise(Effect.gen(body).pipe(Effect.scoped, Effect.provide(TestClock.layer())))
const connected = Effect.gen(function* () {
  const engine = fakeEngine()
  const connection = yield* Effect.provide(makeEngineConnection('http://engine.test'), engine.layer)
  const votes = recorded<boolean>()
  connection.subscribeReachability(votes.push)
  const rpc = createORPCClient<ContractRouterClient<typeof contract, RpcClientContext>>(connection.link)
  return {engine, connection, votes, rpc}
})
const trustFrame = (token: string) => JSON.stringify({type: 'conciv:trust', token})
const swapGlobal = (name: string, descriptor: PropertyDescriptor) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, {configurable: true, ...descriptor})
  return (): void => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, name)
    else Object.defineProperty(globalThis, name, previous)
  }
}

describe('engine connection driver on the test clock', () => {
  it('backs off 0, 250, 325, 422.5 ms up to 2 s, gives up an open after 30 s, and resets the back-off after 1 s up', () =>
    clocked(function* () {
      const {engine, votes, rpc} = yield* connected
      const refused = rpc.meta.harnesses(undefined, {context: {shouldRetry: false}}).then(String, String)
      const failAndWait = (index: number, delayMs: number) =>
        Effect.gen(function* () {
          const voted = (yield* SubscriptionRef.get(votes.seen)).length
          ;(yield* engine.socketAt(index)).drop(1006)
          yield* votes.reached(voted + 1)
          yield* TestClock.adjust(Math.ceil(delayMs) - 1)
          expect(yield* engine.count).toBe(index + 1)
          yield* TestClock.adjust(1)
          expect(yield* engine.count).toBe(index + 2)
        })
      const delays = [250, 325, 422.5, 549.25, 714.025, 928.2325, 1206.70225, 1568.712925, 2000, 2000]
      yield* Effect.forEach(delays, (delayMs, index) => failAndWait(index, delayMs), {discard: true})
      expect(yield* Effect.promise(() => refused)).toBe('Error: Cannot send message, WebSocket is not open.')
      yield* TestClock.adjust(29_999)
      expect(yield* SubscriptionRef.get(votes.seen)).toHaveLength(10)
      yield* TestClock.adjust(1)
      yield* votes.reached(11)
      yield* TestClock.adjust(1999)
      expect(yield* engine.count).toBe(11)
      yield* TestClock.adjust(1)
      ;(yield* engine.socketAt(11)).open()
      yield* votes.reached(12)
      yield* TestClock.adjust(1000)
      yield* failAndWait(11, 250)
      ;(yield* engine.socketAt(12)).open()
      yield* votes.reached(14)
      yield* TestClock.adjust(999)
      yield* failAndWait(12, 325)
    }))

  it('drops an abort for a closed socket, refuses a frame on a closing socket, and a 1008 close revokes the token with no vote, no reconnect, and a reopen on the next call', () =>
    clocked(function* () {
      const {engine, connection, votes, rpc} = yield* connected
      const trusted = connection.trust.requestTrustWithToken('held')
      ;(yield* engine.socketAt(0)).open()
      const [id] = yield* engine.requestOn(0, 1)
      expect((yield* engine.framesOn(0, 1))[0]).toBe(trustFrame(''))
      yield* engine.answer(0, id, {trusted: true})
      expect(yield* Effect.promise(() => trusted)).toBe(true)
      const changes = rpc.sessions.changes()
      const [streamId] = yield* engine.requestOn(0, 2)
      yield* engine.reply(0, streamId, noEvents())
      const stream = yield* Effect.promise(() => changes)
      ;(yield* engine.socketAt(0)).drop(1006)
      yield* votes.reached(2)
      yield* Effect.promise(() => stream.return(undefined))
      yield* TestClock.adjust(250)
      ;(yield* engine.socketAt(1)).open()
      const harnesses = rpc.meta.harnesses()
      const [harnessesId] = yield* engine.requestOn(1, 1)
      yield* engine.answer(1, harnessesId, [])
      expect(yield* Effect.promise(() => harnesses)).toEqual([])
      expect(yield* engine.pathsOn(1, 1)).toEqual(['http://orpc/meta/harnesses'])
      expect((yield* engine.framesOn(1, 1))[0]).toBe(trustFrame('held'))
      ;(yield* engine.socketAt(1)).closing()
      const closing = rpc.meta.harnesses(undefined, {context: {shouldRetry: false}}).then(String, String)
      expect(yield* Effect.promise(() => closing)).toBe('Error: Cannot send message, WebSocket is not open.')
      const statuses = recorded<string>()
      connection.trust.subscribe(statuses.push)
      ;(yield* engine.socketAt(1)).drop(1008)
      expect(yield* statuses.reached(1)).toEqual(['revoked'])
      yield* TestClock.adjust('1 minute')
      expect(yield* engine.count).toBe(2)
      expect(yield* SubscriptionRef.get(votes.seen)).toEqual([true, false, true])
      rpc.meta.harnesses().catch(String)
      ;(yield* engine.socketAt(2)).open()
      expect((yield* engine.framesOn(2, 1))[0]).toBe(trustFrame(''))
    }))

  it('auth answers time out after 3 s, and a one-shot call retries a lost socket until 3 s after it started', () =>
    clocked(function* () {
      const {engine, connection, votes, rpc} = yield* connected
      const asked = connection.trust.requestTrust()
      ;(yield* engine.socketAt(0)).open()
      yield* engine.requestOn(0, 1)
      yield* TestClock.adjust(2999)
      expect(connection.trust.status()).toBe('checking')
      yield* TestClock.adjust(1)
      expect(connection.trust.status()).toBe('unreachable')
      expect(yield* Effect.promise(() => asked)).toBe(false)
      const code = connection.trust.requestAuthCode().then(String, () => 'rejected')
      yield* engine.requestOn(0, 3)
      yield* TestClock.adjust(3000)
      expect(yield* Effect.promise(() => code)).toBe('rejected')
      const harnesses = rpc.meta.harnesses().then(String, () => 'rejected')
      expect((yield* engine.pathsOn(0, 5))[4]).toBe('http://orpc/meta/harnesses')
      yield* TestClock.adjust(2999)
      ;(yield* engine.socketAt(0)).drop(1006)
      yield* votes.reached(2)
      yield* TestClock.adjust(250)
      ;(yield* engine.socketAt(1)).open()
      expect(yield* engine.pathsOn(1, 2)).toContain('http://orpc/meta/harnesses')
      yield* TestClock.adjust(1)
      ;(yield* engine.socketAt(1)).drop(1006)
      expect(yield* Effect.promise(() => harnesses)).toBe('rejected')
    }))

  it('a later token source replaces the earlier one, and a refused storage keeps the token in memory', () => {
    const refuse = (name: string) => () => {
      throw new DOMException('refused', name)
    }
    onTestFinished(swapGlobal('localStorage', {get: refuse('SecurityError')}))
    return clocked(function* () {
      const {engine, connection} = yield* connected
      connection.useTokenSource(async () => 'from-first')
      connection.useTokenSource(async () => 'from-second')
      const asked = connection.trust.requestTrust()
      ;(yield* engine.socketAt(0)).open()
      const [storedId, , stored] = yield* engine.requestOn(0, 1)
      expect(stored).toMatchObject({body: {json: {token: ''}}})
      yield* engine.answer(0, storedId, {trusted: false})
      const [sourcedId, , sourced] = yield* engine.requestOn(0, 2)
      expect(sourced).toMatchObject({body: {json: {token: 'from-second'}}})
      swapGlobal('localStorage', {value: {getItem: () => null, setItem: refuse('QuotaExceededError')}})
      yield* engine.answer(0, sourcedId, {trusted: true})
      expect(yield* Effect.promise(() => asked)).toBe(true)
      expect(connection.trust.status()).toBe('trusted')
    })
  })

  it("an empty api base is the page's origin root and shares that base's connection", () => {
    onTestFinished(swapGlobal('location', {value: new URL('http://page.test/deep/page')}))
    const empty = browserRpcConnection('')
    const root = browserRpcConnection('http://page.test/')
    expect(empty.trust).toBe(root.trust)
    empty.release()
    root.release()
  })
})

describe('a refused trust check', () => {
  it('a 401 answer to the trust check locks the connection instead of reading it as unreachable', () =>
    clocked(function* () {
      const {engine, connection} = yield* connected
      const asked = connection.trust.requestTrust()
      ;(yield* engine.socketAt(0)).open()
      const [id] = yield* engine.requestOn(0, 1)
      const unauthorized = {defined: false, code: 'UNAUTHORIZED', status: 401, message: 'unauthorized'}
      yield* engine.reply(0, id, {json: unauthorized, meta: []}, 401)
      expect(yield* Effect.promise(() => asked)).toBe(false)
      expect(connection.trust.status()).toBe('untrusted')
    }))

  it('an engine base is its origin and path with no trailing slash, so derived urls join onto it once', () => {
    expect(`${normalizeApiBase('http://engine.test/')}/health`).toBe('http://engine.test/health')
    expect(normalizeApiBase('http://engine.test/mount/?q=1#h')).toBe('http://engine.test/mount')
  })
})
