import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect} from '@playwright/test'
import pingServer from '../fixtures/ping/server.js'
import {fixtureHost, getExtensionTestApi} from '../src/get-extension-test-api.js'
import {gateRpcCalls} from '../src/rpc-fault.js'
import {rpcObserverFor} from '../src/rpc-observer.js'

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))
const PING_PATH = ['ext', 'ping', 'ping']
const CORE_NAMESAKE_PATH = ['ping']

test('the page observer sees extension rpc calls from the page-load one onward, over the fetch transport', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(hostDist)})
  try {
    await expect(api.page.getByText('pong: boot')).toBeVisible()
    const observer = rpcObserverFor(api.page)
    const mark = observer.mark()
    await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
    await expect(api.page.getByText('pong: again')).toBeVisible()
    const roundtrip = await observer.completed({path: PING_PATH, since: mark})
    expect(roundtrip.status).toBe(200)
    expect(observer.socketCount()).toBe(0)
    expect(observer.startedCount({path: PING_PATH, since: mark})).toBe(1)
    expect(observer.startedCount({path: PING_PATH})).toBe(2)
  } finally {
    await api.dispose()
  }
})

test('the observer matches a call by its decoded input and never by a shorter path that shares its name', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(hostDist)})
  try {
    const observer = rpcObserverFor(api.page)
    const booted = await observer.completed({path: PING_PATH, input: {value: 'boot'}})
    expect(booted.input).toMatchObject({value: 'boot'})
    await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
    const again = await observer.completed({path: PING_PATH, input: {value: 'again'}})
    expect(again.input).toMatchObject({value: 'again'})
    expect(observer.completedCount({path: PING_PATH, input: {value: 'boot'}})).toBe(1)
    expect(observer.completedCount({path: PING_PATH})).toBe(2)
    expect(observer.startedCount({path: CORE_NAMESAKE_PATH})).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('a call the gate holds stays started and uncompleted until the gate releases it', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(hostDist)})
  try {
    await expect(api.page.getByText('pong: boot')).toBeVisible()
    const observer = rpcObserverFor(api.page)
    const gate = await gateRpcCalls(api.page, {path: PING_PATH})
    const mark = observer.mark()
    await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
    await gate.awaitCaptured(1)
    expect(observer.startedCount({path: PING_PATH, since: mark})).toBe(1)
    expect(observer.completedCount({path: PING_PATH, since: mark})).toBe(0)

    await gate.release()
    await observer.completed({path: PING_PATH, since: mark})
    await expect(api.page.getByText('pong: again')).toBeVisible()
    expect(observer.completedCount({path: PING_PATH, since: mark})).toBe(1)
    await gate.dispose()
  } finally {
    await api.dispose()
  }
})
