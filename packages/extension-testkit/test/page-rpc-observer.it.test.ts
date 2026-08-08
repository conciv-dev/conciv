import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect} from '@playwright/test'
import pingServer from '../fixtures/ping/server.js'
import {fixtureHost, getExtensionTestApi} from '../src/get-extension-test-api.js'
import {rpcObserverFor} from '../src/rpc-observer.js'

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))
const PING_PATH = ['ext', 'ping', 'ping']

test('the page observer sees extension rpc calls made over the connection opened during page load', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(hostDist)})
  try {
    await expect(api.page.getByText('pong: boot')).toBeVisible()
    const observer = rpcObserverFor(api.page)
    const mark = observer.mark()
    await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
    await expect(api.page.getByText('pong: again')).toBeVisible()
    expect(observer.socketCount()).toBe(1)
    expect(observer.startedCount({path: PING_PATH, since: mark})).toBe(1)
    expect(observer.startedCount({path: PING_PATH})).toBe(2)
  } finally {
    await api.dispose()
  }
})
