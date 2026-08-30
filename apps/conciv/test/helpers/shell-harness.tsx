import {createSignal} from 'solid-js'
import {onlineManager} from '@tanstack/query-core'
import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {closeBrowserRpcConnection, makeBrowserRpcClient} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import type {ChatTransportPreference} from '@conciv/client'
import '../../src/lib/api-base.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../../src/router.js'

export type ShellMountOptions = {transport?: ChatTransportPreference}

export type ShellHarness = {
  mountShell: (entry: string, extensions?: AnyExtension[], options?: ShellMountOptions) => void
  navigateToSession: (sessionId: string) => void
  bumpConnectionGeneration: () => void
  dispose: () => void
}

export function createShellHarness(base: () => string): ShellHarness {
  const mounted: {router: ReturnType<typeof createConcivRouter> | null} = {router: null}
  const [connectionGeneration, setConnectionGeneration] = createSignal(0)

  const mountShell = (entry: string, extensions: AnyExtension[] = [], options: ShellMountOptions = {}): void => {
    const apiBase = base()
    window.__CONCIV_API_BASE__ = apiBase
    const router = createConcivRouter({
      rpc: makeBrowserRpcClient(apiBase).rpc,
      history: createMemoryHistory({initialEntries: [entry]}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(options.transport ? JSON.stringify({transport: options.transport}) : ''),
      apiBase: () => apiBase,
      connectionGeneration,
      extensions,
    })
    mounted.router = router
    render(() => <RouterProvider router={router} />)
  }

  const navigateToSession = (sessionId: string): void => {
    void mounted.router?.navigate({to: '/panel/$sessionId', params: {sessionId}})
  }

  const bumpConnectionGeneration = (): void => {
    setConnectionGeneration((current) => current + 1)
  }

  const dispose = (): void => {
    if (mounted.router) disposeConcivRouter(mounted.router)
    mounted.router = null
    closeBrowserRpcConnection(base())
    onlineManager.setOnline(true)
    delete window.__CONCIV_API_BASE__
  }

  return {mountShell, navigateToSession, bumpConnectionGeneration, dispose}
}
