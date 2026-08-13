import './helpers/utilities.css'
import {expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {defineExtension} from '@conciv/extension'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'

function routerWithDisposeSpy(name: string, dispose: () => void) {
  const extension = defineExtension({name}).client(() => ({value: {}, dispose}))
  return createConcivRouter({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    history: createMemoryHistory({initialEntries: ['/']}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
    extensions: [extension],
  })
}

test('unmounting the router-rendered tree disposes every extension instance exactly once', async () => {
  const dispose = vi.fn()
  const router = routerWithDisposeSpy('wrap-disposal-probe', dispose)
  const mounted = render(() => <RouterProvider router={router} />)

  await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  expect(dispose).not.toHaveBeenCalled()

  mounted.unmount()

  expect(dispose).toHaveBeenCalledTimes(1)
})

test('unmounting disposes every extension instance even when one disposer throws', async () => {
  const order: string[] = []
  const first = defineExtension({name: 'wrap-disposal-a'}).client(() => ({value: {}, dispose: () => order.push('a')}))
  const second = defineExtension({name: 'wrap-disposal-b'}).client(() => ({
    value: {},
    dispose: () => {
      order.push('b')
      throw new Error('teardown b blew up')
    },
  }))
  const third = defineExtension({name: 'wrap-disposal-c'}).client(() => ({value: {}, dispose: () => order.push('c')}))
  const router = createConcivRouter({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    history: createMemoryHistory({initialEntries: ['/']}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
    extensions: [first, second, third],
  })
  const mounted = render(() => <RouterProvider router={router} />)

  await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()

  expect(() => mounted.unmount()).not.toThrow()
  expect(order).toEqual(['a', 'b', 'c'])
})

test('calling disposeConcivRouter after an unmount is a no-op', async () => {
  const dispose = vi.fn()
  const router = routerWithDisposeSpy('wrap-disposal-idempotent', dispose)
  const mounted = render(() => <RouterProvider router={router} />)

  await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  mounted.unmount()

  disposeConcivRouter(router)

  expect(dispose).toHaveBeenCalledTimes(1)
})

test('disposeConcivRouter disposes a router that was never rendered, and is idempotent', () => {
  const dispose = vi.fn()
  const router = routerWithDisposeSpy('wrap-disposal-never-rendered', dispose)

  disposeConcivRouter(router)
  expect(dispose).toHaveBeenCalledTimes(1)

  disposeConcivRouter(router)
  expect(dispose).toHaveBeenCalledTimes(1)
})
