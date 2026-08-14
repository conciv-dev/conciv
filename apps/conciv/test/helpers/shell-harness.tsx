import {render} from '@solidjs/testing-library'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {makeBrowserRpcClient} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import {parseConcivSettings} from '../../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../../src/router.js'
import {CORE_BASE, installFakeCore, sessionRow, type FakeCore, type FakeCoreConfig} from './fake-core.js'

export type ShellHarness = {
  mountShell: (entry: string, config?: FakeCoreConfig, extensions?: AnyExtension[]) => void
  core: () => FakeCore | null
  dispose: () => void
}

export function createShellHarness(sessionId: string): ShellHarness {
  let core: FakeCore | null = null
  let mountedRouter: ReturnType<typeof createConcivRouter> | null = null

  const mountShell = (entry: string, config: FakeCoreConfig = {}, extensions: AnyExtension[] = []): void => {
    core = installFakeCore({sessions: [sessionRow({id: sessionId})], ...config})
    const router = createConcivRouter({
      rpc: makeBrowserRpcClient(CORE_BASE, {transport: 'fetch'}).rpc,
      history: createMemoryHistory({initialEntries: [entry]}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
      apiBase: () => CORE_BASE,
      extensions,
    })
    mountedRouter = router
    render(() => <RouterProvider router={router} />)
  }

  const dispose = (): void => {
    if (mountedRouter) disposeConcivRouter(mountedRouter)
    mountedRouter = null
    core?.restore()
    core = null
  }

  return {mountShell, core: () => core, dispose}
}
