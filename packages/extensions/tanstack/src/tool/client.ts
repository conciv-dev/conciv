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

export const routerStateClient = defineTool(routerStateDef).render(routerStateCard)

export const routeTreeClient = defineTool(routeTreeDef).render(routeTreeCard)

export const loaderDataClient = defineTool(loaderDataDef).render(loaderDataCard)

export const queryCacheClient = defineTool(queryCacheDef).render(queryCacheCard)

export const navigateClient = defineTool(navigateDef).render(navigateCard)

export const routerInvalidateClient = defineTool(routerInvalidateDef).render(routerInvalidateCard)

export const backClient = defineTool(backDef).render(backCard)

export const queryInvalidateClient = defineTool(queryInvalidateDef).render(queryInvalidateCard)

export const queryRefetchClient = defineTool(queryRefetchDef).render(queryRefetchCard)

export const buildErrorsClient = defineTool(buildErrorsDef).render(buildErrorsCard)

export const routeManifestClient = defineTool(routeManifestDef).render(routeManifestCard)

export const serverFnTraceClient = defineTool(serverFnTraceDef).render(serverFnTraceCard)
