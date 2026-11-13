import {expect, afterEach, describe, it} from 'vitest'
import {type EngineStaleness} from '@conciv/contract'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '../src/core-kit.js'
import {createServer} from 'node:http'
import {listenLocal} from '../src/listen-local.js'
import {observeRpc} from '../src/rpc-observer.js'
import {rpcSocketFor} from '../src/rpc-socket.js'
import {os} from '@orpc/server'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {encodeRequestMessage, MessageType} from '@orpc/standard-server-peer'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {test as browserTest} from '@conciv/browser-fixture'

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
