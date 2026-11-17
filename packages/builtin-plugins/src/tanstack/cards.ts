import type {ToolCardView} from '@conciv/protocol/tool-view-types'
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

export const tanstackCards = {
  tanstack_router_state: routerStateCard,
  tanstack_route_tree: routeTreeCard,
  tanstack_loader_data: loaderDataCard,
  tanstack_query_cache: queryCacheCard,
  tanstack_query_invalidate: queryInvalidateCard,
  tanstack_query_refetch: queryRefetchCard,
  tanstack_navigate: navigateCard,
  tanstack_router_invalidate: routerInvalidateCard,
  tanstack_back: backCard,
  tanstack_build_errors: buildErrorsCard,
  tanstack_route_manifest: routeManifestCard,
  tanstack_server_fn_trace: serverFnTraceCard,
} satisfies Record<string, ToolCardView>
