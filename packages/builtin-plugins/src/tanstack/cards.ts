import {mapKeys} from 'es-toolkit'
import type {ToolComponent} from '@conciv/plugin/experimental'
import type {Method} from '@conciv/plugin-tanstack/rpc'
import {backCard} from './back-card.js'
import {buildErrorsCard} from './build-errors-card.js'
import {loaderDataCard} from './loader-data-card.js'
import {navigateCard} from './navigate-card.js'
import {queryCacheCard} from './query-cache-card.js'
import {queryInvalidateCard} from './query-invalidate-card.js'
import {queryRefetchCard} from './query-refetch-card.js'
import {routeManifestCard} from './route-manifest-card.js'
import {routerInvalidateCard} from './router-invalidate-card.js'
import {routerStateCard} from './router-state-card.js'
import {routeTreeCard} from './route-tree-card.js'
import {serverFnTraceCard} from './server-fn-trace-card.js'
import {tanstackToolName} from './tanstack-tool-names.js'

const operationCards = {
  router_state: routerStateCard,
  route_tree: routeTreeCard,
  loader_data: loaderDataCard,
  query_cache: queryCacheCard,
  query_invalidate: queryInvalidateCard,
  query_refetch: queryRefetchCard,
  navigate: navigateCard,
  router_invalidate: routerInvalidateCard,
  back: backCard,
} satisfies Partial<Record<Method, ToolComponent>>

export const tanstackCards = {
  ...mapKeys(operationCards, (_card, operation) => tanstackToolName(operation)),
  tanstack_build_errors: buildErrorsCard,
  tanstack_route_manifest: routeManifestCard,
  tanstack_server_fn_trace: serverFnTraceCard,
} satisfies Record<string, ToolComponent>
