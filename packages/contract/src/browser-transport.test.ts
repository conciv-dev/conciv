import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import type {Duplex} from 'node:stream'
import {describe, expect, it as baseIt} from 'vitest'
import {createORPCClient} from '@orpc/client'
import {browserRpcConnection, heldBrowserRpcLink, subscribeRpcReachability} from './browser-transport.js'
import {makeBrowserRpcClient, type RpcClient} from './client.js'

const BASE = 'http://127.0.0.1:9/conciv-timings'

type HeldUpgradeServer = {
  base: string
  upgrades: {count: number; first: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}
}

type Holding = <Held>(held: Held, release: (held: Held) => void) => Held

const it = baseIt.extend<{hold: Holding; peer: HeldUpgradeServer}>({
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  hold: async ({}, use) => {
    const releases: (() => void)[] = []
    await use((held, release) => {
      releases.push(() => release(held))
      return held
    })
    releases.forEach((release) => release())
  },
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  peer: async ({}, use) => {
    const server = createServer()
    const sockets: Duplex[] = []
    const upgrades: HeldUpgradeServer['upgrades'] = {
      count: 0,
      first: Promise.withResolvers<void>(),
      released: Promise.withResolvers<void>(),
    }
    server.on('upgrade', (request, socket) => {
      sockets.push(socket)
      upgrades.count += 1
      upgrades.first.resolve()
      const accept = createHash('sha1')
        .update(`${request.headers['sec-websocket-key'] ?? ''}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64')
      void upgrades.released.promise.then(() =>
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        ),
      )
    })
    const listening = Promise.withResolvers<string>()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return listening.reject(new Error('no port'))
      listening.resolve(`http://127.0.0.1:${address.port}`)
    })
    await use({base: await listening.promise, upgrades})
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => server.close(() => resolve()))
  },
})

const releaseConnection = (connection: {release: () => void}) => connection.release()

describe('browser rpc connection pool by timings', () => {
  it('shares one connection for equal timings of a base and never one socket for different timings', ({hold}) => {
    const held = (timings?: Parameters<typeof browserRpcConnection>[2]) =>
      hold(browserRpcConnection(BASE, undefined, timings), releaseConnection)
    const plain = held()
    const sameAsDefaults = held({})
    const shortened = held({openTimeoutMs: 50})
    const shortenedAgain = held({openTimeoutMs: 50})
    expect(sameAsDefaults.link).toBe(plain.link)
    expect(shortenedAgain.link).toBe(shortened.link)
    expect(shortened.link).not.toBe(plain.link)
  })
})

describe('every pool holder with the same timings', () => {
  it('rides one socket of the base for the connection, the rpc client, the held link and the reachability', async ({
    hold,
    peer,
  }) => {
    const {base} = peer
    const timings = {openTimeoutMs: 60_000}
    const reachable = Promise.withResolvers<void>()
    hold(
      subscribeRpcReachability(
        base,
        (online) => {
          if (online) reachable.resolve()
        },
        timings,
      ),
      (unsubscribe) => unsubscribe(),
    )
    const unanswered = () => undefined
    const anchor = hold(browserRpcConnection(base, undefined, timings), releaseConnection)
    createORPCClient<RpcClient>(anchor.link).sessions.list(undefined).catch(unanswered)
    await peer.upgrades.first.promise
    const client = hold(makeBrowserRpcClient(base, {timings}), (made) => made.close())
    client.rpc.sessions.list(undefined).catch(unanswered)
    const link = hold(
      heldBrowserRpcLink(() => base, undefined, timings),
      releaseConnection,
    )
    createORPCClient<RpcClient>(link.link).sessions.list(undefined).catch(unanswered)
    peer.upgrades.released.resolve()
    await reachable.promise
    expect(peer.upgrades.count).toBe(1)
  })
})
