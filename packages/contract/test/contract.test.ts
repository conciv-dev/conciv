import {describe, expect, expectTypeOf, it, afterAll, beforeAll} from 'vitest'
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
import {browserRpcConnection} from '../src/browser-transport.js'
import {CONCIV_VERSION_HEADER} from '@conciv/protocol/rpc-types'
import type {HarnessListCursor} from '@conciv/protocol/harness-types'
import contractManifest from '../package.json' with {type: 'json'}
import {mergeSettings} from '../src/settings.js'

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
