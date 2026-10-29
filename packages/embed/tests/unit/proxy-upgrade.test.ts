import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'

let kit: EmbedKit

beforeAll(async () => {
  kit = await bootEmbedKit()
}, 60_000)

afterAll(async () => {
  await kit.cleanup()
})

function openChatSocket(proxy: ProxyCore): {socket: WebSocket; opened: Promise<void>; closed: Promise<number>} {
  const socket = new WebSocket(`${proxy.base.replace('http:', 'ws:')}${CHAT_WS_PATH}`)
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), {once: true})
    socket.addEventListener('error', () => reject(new Error('the proxied chat socket never opened')), {once: true})
  })
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)))
  return {socket, opened, closed}
}

describe('the embed test proxy carries the chat websocket', () => {
  it('pipes the upgrade to the target core so the socket opens through the proxy', async () => {
    const proxy = await proxyTo(kit.base)
    const {socket, opened} = openChatSocket(proxy)
    await opened
    expect(proxy.wsConnectionCount()).toBe(1)
    expect(proxy.requestCount()).toBe(0)
    socket.close()
    await proxy.close()
  })

  it('counts http requests and socket upgrades separately on the same proxy', async () => {
    const proxy = await proxyTo(kit.base)
    const {socket, opened} = openChatSocket(proxy)
    await opened
    await fetch(`${proxy.base}/rpc/meta/tools`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: undefined, meta: []}),
    })
    expect(proxy.requestCount()).toBe(1)
    expect(proxy.wsConnectionCount()).toBe(1)
    socket.close()
    await proxy.close()
  })

  it('closing the proxy drops the piped socket so a reconnect gate can force a drop', async () => {
    const proxy = await proxyTo(kit.base)
    const {opened, closed} = openChatSocket(proxy)
    await opened
    await proxy.close()
    expect(await closed).toBeGreaterThan(0)
  })
})
