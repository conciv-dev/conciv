import {defineTool, type AnyToolBuilder} from '@conciv/extension'
import {invalidateQuery, readMutations, readQueryCache, refetchQuery} from '../client/query-adapter.js'
import {readRuntimeErrors} from '../client/error-ring.js'
import {
  goBack,
  invalidateRouter,
  invalidateRouterMatch,
  navigateTo,
  readDataEntries,
  readDetect,
  readLoaderData,
  readRouterState,
  readRouteTree,
} from '../client/router-adapter.js'
import {
  backDef,
  buildErrorsDef,
  dataEntriesDef,
  dataInvalidateDef,
  dataRefetchDef,
  detectDef,
  errorsSnapshotDef,
  loaderDataDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeManifestDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
  serverFnTraceDef,
} from './def.js'
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

export const tanstackClientTools: readonly AnyToolBuilder[] = [
  defineTool(detectDef).client(() => readDetect()),
  defineTool(routerStateDef)
    .client(() => readRouterState())
    .render(routerStateCard),
  defineTool(routeTreeDef)
    .client(() => readRouteTree())
    .render(routeTreeCard),
  defineTool(dataEntriesDef).client(() => readDataEntries()),
  defineTool(loaderDataDef)
    .client((input) => readLoaderData(input.routeId))
    .render(loaderDataCard),
  defineTool(dataInvalidateDef).client((input) => invalidateRouterMatch(input.routeId)),
  defineTool(dataRefetchDef).client((input) => invalidateRouterMatch(input.routeId)),
  defineTool(errorsSnapshotDef).client(() => readRuntimeErrors()),
  defineTool(queryCacheDef)
    .client(() => ({queries: readQueryCache(), mutations: readMutations()}))
    .render(queryCacheCard),
  defineTool(queryInvalidateDef)
    .client((input) => invalidateQuery(input.key))
    .render(queryInvalidateCard),
  defineTool(queryRefetchDef)
    .client((input) => refetchQuery(input.key))
    .render(queryRefetchCard),
  defineTool(navigateDef)
    .client((input) => navigateTo(input))
    .render(navigateCard),
  defineTool(routerInvalidateDef)
    .client(() => invalidateRouter())
    .render(routerInvalidateCard),
  defineTool(backDef)
    .client(() => goBack())
    .render(backCard),
  defineTool(buildErrorsDef).render(buildErrorsCard),
  defineTool(routeManifestDef).render(routeManifestCard),
  defineTool(serverFnTraceDef).render(serverFnTraceCard),
]
