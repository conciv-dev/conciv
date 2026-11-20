import {expect, afterEach, describe, it, onTestFinished} from 'vitest'
import {existsSync, rmSync} from 'node:fs'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {type EngineStaleness} from '@conciv/contract'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {bootCoreKit, type CoreKit} from '../src/core-kit.js'
import {test as nodeTest, test as browserTest} from '../src/node.js'
import {createServer} from 'node:http'
import {listenLocal} from '../src/listen-local.js'
import {observeRpc} from '../src/rpc-observer.js'
import {rpcSocketFor} from '../src/rpc-socket.js'
import {failRpcCalls, gateRpcCalls} from '../src/rpc-fault.js'
import {os} from '@orpc/server'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {encodeRequestMessage, MessageType} from '@orpc/standard-server-peer'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {createHash} from 'node:crypto'
import type {Duplex} from 'node:stream'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'

describe('core kit seams', () => {
  const STALENESS: EngineStaleness = {
    stale: true,
    changed: ['@conciv/kit-probe'],
    tracked: ['@conciv/kit-probe'],
    bootedAt: 1_700_000_000_000,
    fingerprint: 'kitprobe123',
  }

  const ORIGIN = 'https://widget.example.test'

  const state = {kit: undefined as CoreKit | undefined}

  afterEach(async () => {
    await state.kit?.cleanup()
    state.kit = undefined
  })

  describe('bootCoreKit seams', () => {
    it('adopts the harness transcript rows as external sessions with their transcript sizes', async () => {
      const kit = await bootCoreKit({
        id: 'seams-history',
        history: [
          {
            id: HarnessSessionId.parse('native-1'),
            derivedTitle: 'A native session',
            updatedAt: 1_700,
            sizeBytes: 7,
          },
        ],
      })
      state.kit = kit

      const {sessions} = await kit.rpc.sessions.list({})
      const adopted = sessions.find((meta) => meta.native?.nativeId === 'native-1')

      expect(adopted?.origin).toBe('external')
      expect(adopted?.sizeBytes).toBe(7)
      expect(adopted?.title).toBe('A native session')
      expect(adopted?.running).toBe(false)
    }, 30_000)

    it('serves the injected staleness probe to the widget rpc surface', async () => {
      const kit = await bootCoreKit({id: 'seams-staleness', staleness: () => STALENESS})
      state.kit = kit

      expect(await kit.rpc.meta.engine()).toEqual(STALENESS)
    }, 30_000)

    it('lets a non-loopback origin through only when the kit declares it allowed', async () => {
      const closed = await bootCoreKit({id: 'seams-origins-closed'})
      state.kit = closed
      const rejected = await fetch(`${closed.base}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
      })
      await closed.cleanup()
      state.kit = undefined

      const open = await bootCoreKit({id: 'seams-origins-open', allowedOrigins: [ORIGIN]})
      state.kit = open
      const accepted = await fetch(`${open.base}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
      })

      expect(rejected.status).toBe(403)
      expect(accepted.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    }, 30_000)

    it('keeps a passed state root so a second kit on the same folder reads what the first one stored', async () => {
      const stateRoot = tempDir('conciv-core-kit-')
      onTestFinished(() => rmSync(stateRoot, {recursive: true, force: true}))

      const first = await bootCoreKit({id: 'seams-state-root-first', stateRoot})
      state.kit = first
      const {sessionId} = await first.rpc.sessions.create()
      await first.rpc.sessions.rename({sessionId, title: 'Kept across kits'})
      await first.cleanup()
      state.kit = undefined

      const second = await bootCoreKit({id: 'seams-state-root-second', stateRoot})
      state.kit = second
      const {sessions} = await second.rpc.sessions.list({})

      expect(sessions.find((meta) => meta.id === sessionId)?.title).toBe('Kept across kits')
    }, 30_000)
  })
})

describe('listen local', () => {
  describe('listenLocal', () => {
    it('rejects instead of hanging when the requested port is already bound', async () => {
      const holder = createServer()
      const bound = await listenLocal(holder)
      const contender = createServer()
      await expect(listenLocal(contender, bound.port)).rejects.toThrow()
      await bound.close()
    })
  })
})

describe('rpc socket routing', () => {
  const CLOSE_EVENT = 'conciv-test:close-rpc-socket'

  browserTest(
    'a socket the page closes is closed on the engine too, ending the calls it carried',
    async ({browser}) => {
      const started = Promise.withResolvers<void>()
      const ended = Promise.withResolvers<void>()
      const router = {
        wait: os.handler(
          ({signal}) =>
            new Promise<null>((resolve) => {
              started.resolve()
              signal?.addEventListener('abort', () => {
                ended.resolve()
                resolve(null)
              })
            }),
        ),
      }
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        await rpcSocketFor(page).installed
        const body = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize(undefined)
        const frame = await encodeRequestMessage('1', MessageType.REQUEST, {
          url: new URL('http://orpc/wait'),
          method: 'POST',
          headers: {},
          body,
        })
        if (typeof frame !== 'string') throw new Error('the rpc request frame encoded to binary')
        await page.evaluate(
          ({url, frame, closeEvent}) =>
            new Promise<void>((resolve) => {
              const socket = new WebSocket(url)
              socket.addEventListener('open', () => {
                socket.send(frame)
                resolve()
              })
              window.addEventListener(closeEvent, () => socket.close(1000))
            }),
          {url: served.wsUrl, frame, closeEvent: CLOSE_EVENT},
        )
        await started.promise
        await page.evaluate((closeEvent) => window.dispatchEvent(new Event(closeEvent)), CLOSE_EVENT)
        await ended.promise
      } finally {
        await page.close()
        await served.close()
      }
    },
    15_000,
  )
})

describe('rpc gate input pattern', () => {
  async function requestFrame(id: string, input: unknown): Promise<string> {
    const body = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize(input)
    const frame = await encodeRequestMessage(id, MessageType.REQUEST, {
      url: new URL('http://orpc/echo'),
      method: 'POST',
      headers: {},
      body,
    })
    if (typeof frame !== 'string') throw new Error('the rpc request frame encoded to binary')
    return frame
  }

  browserTest(
    'a gate with an input pattern holds only the matching call, while the driver calls on the same path pass',
    async ({browser}) => {
      const router = {echo: os.handler(({input}) => input)}
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        const observer = observeRpc(page)
        const gate = await gateRpcCalls(page, {path: ['echo'], input: {kind: 'held'}})
        const frames = [await requestFrame('1', {kind: 'held'}), await requestFrame('2', {kind: 'driver'})]
        await page.evaluate(
          ({url, requestFrames}) =>
            new Promise<void>((resolve) => {
              const socket = new WebSocket(url)
              socket.addEventListener('open', () => {
                for (const frame of requestFrames) socket.send(frame)
                resolve()
              })
            }),
          {url: served.wsUrl, requestFrames: frames},
        )
        await gate.awaitCaptured(1)
        await observer.completed({path: ['echo'], input: {kind: 'driver'}, status: 200})
        expect(gate.pending()).toBe(1)
        expect(observer.completedCount({path: ['echo'], input: {kind: 'held'}})).toBe(0)
        await gate.release()
        await observer.completed({path: ['echo'], input: {kind: 'held'}, status: 200})
        expect(gate.pending()).toBe(0)
        await gate.dispose()
        observer.dispose()
      } finally {
        await page.close()
        await served.close()
      }
    },
    15_000,
  )
})

describe('rpc observer dispose', () => {
  const NATURAL_TIMEOUT_MS = 300

  browserTest(
    'dispose fails the pending waiter immediately instead of leaving its timer to fire naturally',
    async ({browser}) => {
      const page = await browser.newPage()
      await page.goto('about:blank')
      try {
        const observer = observeRpc(page)
        const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
        pending.catch(() => {})
        observer.dispose()
        await expect(pending).rejects.toThrow(/disposed/)
      } finally {
        await page.close()
      }
    },
  )

  browserTest(
    'dispose does not leak an unhandled rejection for a wait nobody awaited, and an awaited wait still rejects',
    async ({browser}) => {
      const page = await browser.newPage()
      await page.goto('about:blank')
      try {
        const observer = observeRpc(page)
        observer.completed({path: ['abandoned', 'wait'], timeout: NATURAL_TIMEOUT_MS})
        const awaited = observer.completed({path: ['awaited', 'wait'], timeout: NATURAL_TIMEOUT_MS})

        const unhandled: unknown[] = []
        const onUnhandledRejection = (reason: unknown): void => void unhandled.push(reason)
        process.on('unhandledRejection', onUnhandledRejection)

        try {
          observer.dispose()
          await expect(awaited).rejects.toThrow(/disposed/)
          await new Promise((resolve) => setImmediate(resolve))
          expect(unhandled).toEqual([])
        } finally {
          process.off('unhandledRejection', onUnhandledRejection)
        }
      } finally {
        await page.close()
      }
    },
  )
})

describe('rpc gate abandoned calls', () => {
  browserTest(
    'a call the page aborts after its answer arrived is reported as given up, once a later frame on the socket is seen',
    async ({browser}) => {
      const router = {echo: os.handler(() => 'answered')}
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        const gate = await gateRpcCalls(page, {path: ['echo']})
        const body = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize(undefined)
        const request = (id: string) =>
          encodeRequestMessage(id, MessageType.REQUEST, {
            url: new URL('http://orpc/echo'),
            method: 'POST',
            headers: {},
            body,
          })
        const held = await request('1')
        const barrier = await request('2')
        const abort = await encodeRequestMessage('1', MessageType.ABORT_SIGNAL, undefined)
        if (typeof held !== 'string' || typeof barrier !== 'string' || typeof abort !== 'string') {
          throw new Error('an rpc frame encoded to binary')
        }
        const exchange = page.evaluate(
          ({url, held, barrier, abort}) =>
            new Promise<number>((resolve) => {
              const socket = new WebSocket(url)
              const received = {count: 0}
              socket.addEventListener('message', () => {
                received.count += 1
                if (received.count === 1) {
                  socket.send(abort)
                  socket.send(barrier)
                  return
                }
                resolve(received.count)
              })
              socket.addEventListener('open', () => socket.send(held))
            }),
          {url: served.wsUrl, held, barrier, abort},
        )
        await gate.awaitCaptured(1)
        await gate.release()
        expect(await exchange).toBe(2)
        await expect(gate.answered()).rejects.toThrow('the page gave up on this call before it was answered')
      } finally {
        await page.close()
        await served.close()
      }
    },
    15_000,
  )
})

describe('rpc faults by input', () => {
  browserTest(
    'a gate given an input holds only the calls whose input matches, and the others pass',
    async ({browser}) => {
      const router = {echo: os.handler(({input}) => input)}
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        const gate = await gateRpcCalls(page, {path: ['echo'], input: {value: 'held'}})
        const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())
        const request = (id: string, value: string) =>
          encodeRequestMessage(id, MessageType.REQUEST, {
            url: new URL('http://orpc/echo'),
            method: 'POST',
            headers: {},
            body: serializer.serialize({value}),
          })
        const held = await request('1', 'held')
        const passed = await request('2', 'passed')
        if (typeof held !== 'string' || typeof passed !== 'string') throw new Error('an rpc frame encoded to binary')
        const firstAnswer = page.evaluate(
          ({url, heldFrame, passedFrame}) =>
            new Promise<void>((resolve) => {
              const socket = new WebSocket(url)
              socket.addEventListener('message', () => resolve(), {once: true})
              socket.addEventListener('open', () => {
                socket.send(heldFrame)
                socket.send(passedFrame)
              })
            }),
          {url: served.wsUrl, heldFrame: held, passedFrame: passed},
        )
        await firstAnswer
        expect(gate.pending()).toBe(1)
        await gate.release()
        await expect(gate.answered()).resolves.toEqual({value: 'held'})
      } finally {
        await page.close()
        await served.close()
      }
    },
    15_000,
  )

  browserTest(
    'a failure given an input fails only the calls whose input matches, and the others are answered',
    async ({browser}) => {
      const router = {echo: os.handler(({input}) => input)}
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        const observer = observeRpc(page)
        const fault = await failRpcCalls(page, {path: ['echo'], input: {value: 'failed'}})
        const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())
        const request = (id: string, value: string) =>
          encodeRequestMessage(id, MessageType.REQUEST, {
            url: new URL('http://orpc/echo'),
            method: 'POST',
            headers: {},
            body: serializer.serialize({value}),
          })
        const failed = await request('1', 'failed')
        const passed = await request('2', 'passed')
        if (typeof failed !== 'string' || typeof passed !== 'string') throw new Error('an rpc frame encoded to binary')
        await page.evaluate(
          ({url, failedFrame, passedFrame}) => {
            const socket = new WebSocket(url)
            socket.addEventListener('open', () => {
              socket.send(failedFrame)
              socket.send(passedFrame)
            })
          },
          {url: served.wsUrl, failedFrame: failed, passedFrame: passed},
        )
        await expect(observer.completed({path: ['echo'], input: {value: 'failed'}})).resolves.toMatchObject({
          status: 500,
        })
        await expect(observer.completed({path: ['echo'], input: {value: 'passed'}})).resolves.toMatchObject({
          status: 200,
          output: {value: 'passed'},
        })
        await fault.dispose()
      } finally {
        await page.close()
        await served.close()
      }
    },
    15_000,
  )

  browserTest(
    'a gate that releases its held call as a failure is answered with that failure',
    async ({browser}) => {
      const router = {echo: os.handler(({input}) => input)}
      const served = await serveRpcRouter({router})
      const page = await browser.newPage()
      try {
        await page.goto(served.base)
        const gate = await gateRpcCalls(page, {path: ['echo'], input: {value: 'held'}, onRelease: 'fail'})
        const body = new StandardRPCSerializer(new StandardRPCJsonSerializer()).serialize({value: 'held'})
        const held = await encodeRequestMessage('1', MessageType.REQUEST, {
          url: new URL('http://orpc/echo'),
          method: 'POST',
          headers: {},
          body,
        })
        if (typeof held !== 'string') throw new Error('an rpc frame encoded to binary')
        await page.evaluate(
          ({url, heldFrame}) => {
            const socket = new WebSocket(url)
            socket.addEventListener('open', () => socket.send(heldFrame))
          },
          {url: served.wsUrl, heldFrame: held},
        )
        await gate.awaitCaptured(1)
        await gate.release()
        await expect(gate.answered()).resolves.toBeUndefined()
        await gate.dispose()
      } finally {
        await page.close()
        await served.close()
      }
    },
    30_000,
  )
})

describe('rpc socket liveness', () => {
  const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

  const handshakeAnswer = (key: string): string =>
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64')}`,
      '',
      '',
    ].join('\r\n')

  browserTest(
    'an rpc socket counts as live once the page speaks on it, not when its handshake is sent',
    async ({browser}) => {
      const upgraded = Promise.withResolvers<() => void>()
      const upgrades: Duplex[] = []
      const server = createServer((_request, response) => response.end('<!doctype html><meta charset="utf-8">'))
      server.on('upgrade', (request, socket) => {
        const key = request.headers['sec-websocket-key'] ?? ''
        upgrades.push(socket)
        upgraded.resolve(() => socket.write(handshakeAnswer(key)))
      })
      const bound = await listenLocal(server)
      const page = await browser.newPage()
      try {
        const watch = rpcSocketFor(page)
        await watch.installed
        await page.goto(bound.base)
        const order: string[] = []
        const live = watch.awaitLive().then(() => order.push('live'))
        const requested = page.waitForEvent('websocket')
        await page.evaluate(
          (url) => {
            const socket = new WebSocket(url)
            socket.addEventListener('open', () => socket.send('{}'))
          },
          `${bound.base.replace('http:', 'ws:')}${RPC_WS_PATH}`,
        )
        const answer = await upgraded.promise
        await requested
        expect(watch.opened()).toBe(1)
        expect(watch.liveSockets()).toBe(0)
        order.push('answered')
        answer()
        await live
        expect(order).toEqual(['answered', 'live'])
        expect(watch.liveSockets()).toBe(1)
      } finally {
        await page.close()
        for (const socket of upgrades) socket.destroy()
        await bound.close()
      }
    },
    15_000,
  )
})

const NODE_FIXTURE_REPLY = 'Scripted reply from the in-process engine'
const ECHO_PLUGIN = `export default {
  id: 'echo',
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: 'echo',
        description: 'Answers with the text it is given',
        input: {type: 'object', properties: {text: {type: 'string'}}, required: ['text']},
        execute: async ({text}) => {
          if (text === '') throw new Error('there is no text to echo')
          return {content: text}
        },
      })
    })
  },
}
`

const CONFIG_PLUGIN = `import {Config, Effect} from ${JSON.stringify(import.meta.resolve('effect'))}
import {z} from ${JSON.stringify(import.meta.resolve('zod'))}
import {Plugin} from ${JSON.stringify(import.meta.resolve('@conciv/plugin/effect'))}

export default Plugin.define({
  id: 'config-reader',
  effect: (ctx) =>
    ctx.tool.transform((tools) =>
      tools.add({
        name: 'read_config',
        description: 'Answers with a value read from the engine config',
        input: z.object({name: z.string()}),
        execute: ({name}) =>
          Effect.gen(function* () {
            return {content: yield* Config.String(name).pipe(Config.withDefault('unset'))}
          }),
      }),
    ),
})
`
const FIXTURE_ENV_KEY = 'CONCIV_TESTKIT_FIXTURE_VALUE'

nodeTest.override({
  engineOptions: {
    id: 'node-fixture',
    text: NODE_FIXTURE_REPLY,
    files: {'conciv/plugins/echo.js': ECHO_PLUGIN, 'conciv/plugins/config-reader.js': CONFIG_PLUGIN},
  },
})

describe('node fixtures', () => {
  const first = {tmp: '', stateRoot: ''}

  nodeTest('a session on the in-process engine answers a scripted turn', async ({engine, tmp}) => {
    expect(new URL(engine.origin).hostname).toBe('127.0.0.1')
    const events = await (await engine.turn('hello')).done()
    expect(events.text()).toContain(NODE_FIXTURE_REPLY)
    expect(existsSync(tmp)).toBe(true)
    first.tmp = tmp
    first.stateRoot = engine.stateRoot
  })

  nodeTest('the file browser opens a page and reads its title', async ({browser}) => {
    const page = await browser.newPage()
    await page.setContent('<title>conciv node browser</title>')
    expect(await page.title()).toBe('conciv node browser')
    await page.close()
  })

  nodeTest('the engine lives for the file and each test gets a fresh temp dir', async ({engine, tmp}) => {
    expect(engine.stateRoot).toBe(first.stateRoot)
    expect(tmp).not.toBe(first.tmp)
    expect(existsSync(first.tmp)).toBe(false)
  })

  nodeTest(
    'a fresh session sends and is approved, the plugin tool answers and fails typed, and a per-test engine keeps its history across a restart',
    async ({engine, session, plugin, freshEngine, tmp}) => {
      expect(session.id).not.toBe(await engine.session())
      expect((await (await session.send('hello')).done()).text()).toContain(NODE_FIXTURE_REPLY)

      const listening = await session.events()
      const asked = listening.waitFor((event) => readApprovalAsk(event) !== null)
      engine.harness.script.scriptPermissionAsk({toolName: 'Bash', input: {command: 'ls'}})
      const asking = await session.send('may I run ls')
      expect(readApprovalAsk(await asked)).toMatchObject({toolName: 'bash ls'})
      expect(await session.approve()).toHaveLength(1)
      expect((await asking.done()).errors()).toEqual([])

      expect(await plugin.tool('echo').call({text: 'echoed by the plugin'})).toBe('echoed by the plugin')
      await expect(plugin.tool('echo').failure({text: ''})).resolves.toEqual({
        tool: 'echo',
        message: expect.stringContaining('there is no text to echo'),
      })

      const before = await freshEngine({stateRoot: tmp})
      const kept = await before.session()
      await (await before.turn('kept across the restart', {session: kept})).done()
      await before.cleanup()
      const after = await freshEngine({stateRoot: tmp})
      expect((await after.hydrate(kept)).messages.flatMap((message) => message.parts)).toContainEqual(
        expect.objectContaining({type: 'text', content: 'kept across the restart'}),
      )

      const configured = await freshEngine({env: {[FIXTURE_ENV_KEY]: 'from the engine config'}})
      expect(await configured.callTool('read_config', {name: FIXTURE_ENV_KEY}, await configured.session())).toBe(
        'from the engine config',
      )
      expect(process.env[FIXTURE_ENV_KEY]).toBeUndefined()
    },
  )
})
