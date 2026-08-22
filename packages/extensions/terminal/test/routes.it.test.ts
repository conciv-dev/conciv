import {randomUUID} from 'node:crypto'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import WebSocket from 'ws'
import type {RouterClient} from '@orpc/server'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {TerminalRouter} from '../src/server.js'
import {recordingHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'

type Client = {ws: WebSocket; received: string[]; controls: string[]}

function connect(
  wsBase: string,
  sessionId: string,
  params = '',
  onData: (text: string) => void = () => {},
): Promise<Client> {
  const ws = new WebSocket(`${wsBase}/api/ext/terminal/tty?session=${sessionId}${params}`)
  const client: Client = {ws, received: [], controls: []}
  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      client.controls.push(String(data))
      return
    }
    client.received.push(new TextDecoder().decode(data as Buffer))
    onData(client.received.join(''))
  })
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(client))
    ws.on('error', reject)
  })
}

describe('terminal extension routes', () => {
  const sessionId = `conciv_${randomUUID()}`
  const ctx: {server?: TerminalTestServer} = {}
  const rpc = () => {
    if (!ctx.server) throw new Error('server not started')
    return ctx.server.rpc
  }
  const wsBase = () => ctx.server?.wsBase ?? ''

  beforeAll(async () => {
    ctx.server = await startTerminalServer()
  })

  afterAll(() => ctx.server?.close())

  it('reports no live terminal before open', async () => {
    expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})
  })

  it('opens a pty and streams bytes over ws', async () => {
    expect(await rpc().open({sessionId})).toEqual({alive: true})
    expect((await rpc().state({sessionId})).alive).toBe(true)

    const roundTripped = Promise.withResolvers<string>()
    const resized = Promise.withResolvers<string>()
    const client = await connect(wsBase(), sessionId, '&cols=100&rows=30', (text) => {
      if (text.includes('ws-roundtrip-42')) roundTripped.resolve(text)
      if (text.includes('27 91')) resized.resolve(text)
    })
    client.ws.send('echo ws-roundtrip-$((40+2))\r')
    expect(await roundTripped.promise).toContain('ws-roundtrip-42')

    client.ws.send(JSON.stringify({type: 'resize', cols: 91, rows: 27}))
    client.ws.send('stty size\r')
    expect(await resized.promise).toContain('27 91')
    client.ws.close()
  })

  it('serves the same rpc procedures over the composite websocket mount', async () => {
    const socket = new globalThis.WebSocket(ctx.server?.rpcWsUrl ?? '')
    const wsClient = rpcOverWebsocket<RouterClient<TerminalRouter>>(socket, {path: ['ext', 'terminal']})
    expect(await wsClient.state({sessionId})).toEqual(await rpc().state({sessionId}))
    expect((await wsClient.state({sessionId})).alive).toBe(true)
    socket.close()
  })

  it('replays buffered bytes on reconnect', async () => {
    const replayed = Promise.withResolvers<string>()
    const client = await connect(wsBase(), sessionId, '', (text) => {
      if (text.includes('ws-roundtrip-42')) replayed.resolve(text)
    })
    expect(await replayed.promise).toContain('ws-roundtrip-42')
    client.ws.close()
  })

  it('open is idempotent while the pty is alive: buffer survives a re-open', async () => {
    expect(await rpc().open({sessionId})).toEqual({alive: true})
    const replayed = Promise.withResolvers<string>()
    const client = await connect(wsBase(), sessionId, '', (text) => {
      if (text.includes('ws-roundtrip-42')) replayed.resolve(text)
    })
    expect(await replayed.promise).toContain('ws-roundtrip-42')
    client.ws.close()
  })

  it('inject control frame writes a marker readable by a reconnecting socket', async () => {
    const injected = Promise.withResolvers<string>()
    const client = await connect(wsBase(), sessionId, '', (text) => {
      if (text.includes('\r\nconciv says hi\r\n')) injected.resolve(text)
    })
    client.ws.send(JSON.stringify({type: 'inject', text: 'conciv says hi'}))
    expect(await injected.promise).toContain('\r\nconciv says hi\r\n')
    client.ws.close()
    const replayed = Promise.withResolvers<string>()
    const second = await connect(wsBase(), sessionId, '', (text) => {
      if (text.includes('\r\nconciv says hi\r\n')) replayed.resolve(text)
    })
    expect(await replayed.promise).toContain('\r\nconciv says hi\r\n')
    second.ws.close()
  })

  it('rejects ws for a session with no live pty', async () => {
    const other = `conciv_${randomUUID()}`
    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${other}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('refuses a malformed or missing session with a 400 before any upgrade', async () => {
    const base = ctx.server?.base ?? ''
    for (const query of ['?session=not-a-session', '?session=', '']) {
      const response = await fetch(`${base}/api/ext/terminal/tty${query}`)
      expect(response.status).toBe(400)
      expect(await response.text()).toBe('invalid or missing session')
    }
    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=not-a-session`)
    const status = await new Promise<number>((resolve, reject) => {
      ws.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
      ws.on('open', () => reject(new Error('the upgrade completed for a malformed session')))
    })
    expect(status).toBe(400)
  }, 5000)

  it('close kills the pty and later ws connects are refused', async () => {
    expect(await rpc().close({sessionId})).toEqual({alive: false})
    expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})

    const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${sessionId}`)
    const code = await new Promise<number>((resolve, reject) => {
      ws.on('close', (c) => resolve(c))
      ws.on('error', reject)
    })
    expect(code).toBe(4404)
  })

  it('spawns with model override, conciv mcp url, and session id', async () => {
    const {harness, captured} = recordingHarness()
    const dedicated = await startTerminalServer(harness)
    try {
      expect(await dedicated.rpc.open({sessionId, model: 'claude-x'})).toEqual({alive: true})
      expect(captured).toHaveLength(1)
      expect(captured[0]?.model).toBe('claude-x')
      expect(captured[0]?.mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/mcp$/)
      expect(captured[0]?.concivSessionId).toBe(sessionId)
    } finally {
      await dedicated.close()
    }
  })

  it('spawns with an mcp url that carries the app base path', async () => {
    const {harness, captured} = recordingHarness()
    const dedicated = await startTerminalServer(harness, {basePath: '/t/tok-terminal'})
    try {
      expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
      expect(captured[0]?.mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/t\/tok-terminal\/api\/mcp$/)
    } finally {
      await dedicated.close()
    }
  })

  it('injects a resumed marker when reopening an existing transcript', async () => {
    const {harness} = recordingHarness()
    const dedicated = await startTerminalServer({...harness, transcriptExists: () => true})
    try {
      dedicated.sessions.tokens.set(sessionId, HarnessSessionId.parse(randomUUID()))
      expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
      const resumed = Promise.withResolvers<string>()
      const client = await connect(dedicated.wsBase, sessionId, '', (text) => {
        if (text.includes('\u2500 conciv: resumed session \u2500')) resumed.resolve(text)
      })
      expect(await resumed.promise).toContain('\u2500 conciv: resumed session \u2500')
      client.ws.close()
    } finally {
      await dedicated.close()
    }
  })

  it('rejects open when the harness has no tty command', async () => {
    const bare = await startTerminalServer({id: 'no-tty'})
    try {
      await expect(bare.rpc.open({sessionId})).rejects.toMatchObject({code: 'NO_TTY'})
    } finally {
      await bare.close()
    }
  })
})
