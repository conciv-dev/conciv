import {createRouter} from '@tanstack/solid-router'
import type {RouterHistory} from '@tanstack/solid-router'
import type {RpcClient} from '@conciv/contract'
import {routeTree} from './routeTree.gen'
import type {ConcivSettings} from './data/settings.js'

export type ConcivEnvironment = {rootNode: Node; document: Document}

export type ConcivRouterContext = {
  rpc: RpcClient
  environment: ConcivEnvironment
  settings: ConcivSettings
}

export type ConcivRouterConfig = {
  rpc: RpcClient
  history: RouterHistory
  environment: ConcivEnvironment
  settings: ConcivSettings
}

export function createConcivRouter(config: ConcivRouterConfig) {
  return createRouter({
    routeTree,
    history: config.history,
    context: {rpc: config.rpc, environment: config.environment, settings: config.settings},
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createConcivRouter>
  }
}
