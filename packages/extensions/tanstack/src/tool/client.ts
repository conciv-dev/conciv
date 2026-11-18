import {defineTool, type AnyToolBuilder} from '@conciv/extension'
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

export const tanstackClientTools: readonly AnyToolBuilder[] = [
  defineTool(routerStateDef).render(routerStateCard),
  defineTool(routeTreeDef).render(routeTreeCard),
  defineTool(loaderDataDef).render(loaderDataCard),
  defineTool(queryCacheDef).render(queryCacheCard),
  defineTool(queryInvalidateDef).render(queryInvalidateCard),
  defineTool(queryRefetchDef).render(queryRefetchCard),
  defineTool(navigateDef).render(navigateCard),
  defineTool(routerInvalidateDef).render(routerInvalidateCard),
  defineTool(backDef).render(backCard),
  defineTool(buildErrorsDef).render(buildErrorsCard),
  defineTool(routeManifestDef).render(routeManifestCard),
  defineTool(serverFnTraceDef).render(serverFnTraceCard),
]
