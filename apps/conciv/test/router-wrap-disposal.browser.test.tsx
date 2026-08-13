import './helpers/utilities.css'
import {expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {defineExtension} from '@conciv/extension'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter} from '../src/router.js'

test('unmounting the router-rendered tree disposes every extension instance exactly once', async () => {
  const dispose = vi.fn()
  const extension = defineExtension({name: 'wrap-disposal-probe'}).client(() => ({value: {}, dispose}))
  const router = createConcivRouter({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    history: createMemoryHistory({initialEntries: ['/']}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
    extensions: [extension],
  })
  const mounted = render(() => <RouterProvider router={router} />)

  await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  expect(dispose).not.toHaveBeenCalled()

  mounted.unmount()

  expect(dispose).toHaveBeenCalledTimes(1)
})
