import {defineTool} from '@conciv/extension'
import {
  backDef,
  buildErrorsDef,
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
import {BackCard} from './back-card.js'
import {BuildErrorsCard} from './build-errors-card.js'
import {LoaderDataCard} from './loader-data-card.js'
import {NavigateCard} from './navigate-card.js'
import {QueryCacheCard} from './query-cache-card.js'
import {QueryInvalidateCard} from './query-invalidate-card.js'
import {QueryRefetchCard} from './query-refetch-card.js'
import {RouteManifestCard} from './route-manifest-card.js'
import {RouterInvalidateCard} from './router-invalidate-card.js'
import {RouterStateCard} from './router-state-card.js'
import {RouteTreeCard} from './route-tree-card.js'
import {ServerFnTraceCard} from './server-fn-trace-card.js'

export const routerStateClient = defineTool(routerStateDef).render(RouterStateCard)

export const routeTreeClient = defineTool(routeTreeDef).render(RouteTreeCard)

export const loaderDataClient = defineTool(loaderDataDef).render(LoaderDataCard)

export const queryCacheClient = defineTool(queryCacheDef).render(QueryCacheCard)

export const navigateClient = defineTool(navigateDef).render(NavigateCard)

export const routerInvalidateClient = defineTool(routerInvalidateDef).render(RouterInvalidateCard)

export const backClient = defineTool(backDef).render(BackCard)

export const queryInvalidateClient = defineTool(queryInvalidateDef).render(QueryInvalidateCard)

export const queryRefetchClient = defineTool(queryRefetchDef).render(QueryRefetchCard)

export const buildErrorsClient = defineTool(buildErrorsDef).render(BuildErrorsCard)

export const routeManifestClient = defineTool(routeManifestDef).render(RouteManifestCard)

export const serverFnTraceClient = defineTool(serverFnTraceDef).render(ServerFnTraceCard)
