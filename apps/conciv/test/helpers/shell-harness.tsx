import {onlineManager} from '@tanstack/query-core'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {closeBrowserRpcConnection, makeBrowserRpcClient} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import '../../src/lib/api-base.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../../src/router.js'

export type ShellHarness = {
  mountShell: (entry: string, extensions?: AnyExtension[]) => void
  dispose: () => void
}

export function createShellHarness(base: () => string): ShellHarness {
  const mounted: {router: ReturnType<typeof createConcivRouter> | null} = {router: null}

  const mountShell = (entry: string, extensions: AnyExtension[] = []): void => {
    const apiBase = base()
    window.__CONCIV_API_BASE__ = apiBase
    const router = createConcivRouter({
      rpc: makeBrowserRpcClient(apiBase, {transport: 'fetch'}).rpc,
      history: createMemoryHistory({initialEntries: [entry]}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
      apiBase: () => apiBase,
      extensions,
    })
    mounted.router = router
    render(() => <RouterProvider router={router} />)
  }

  const dispose = (): void => {
    if (mounted.router) disposeConcivRouter(mounted.router)
    mounted.router = null
    closeBrowserRpcConnection(base())
    onlineManager.setOnline(true)
    delete window.__CONCIV_API_BASE__
  }

  return {mountShell, dispose}
}
