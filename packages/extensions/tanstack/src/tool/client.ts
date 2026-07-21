import {defineTool} from '@conciv/extension'
import {loaderDataDef, queryCacheDef, routeTreeDef, routerStateDef} from './def.js'
import {LoaderDataCard} from './loader-data-card.js'
import {QueryCacheCard} from './query-cache-card.js'
import {RouterStateCard} from './router-state-card.js'
import {RouteTreeCard} from './route-tree-card.js'

export const routerStateClient = defineTool(routerStateDef).render(RouterStateCard)

export const routeTreeClient = defineTool(routeTreeDef).render(RouteTreeCard)

export const loaderDataClient = defineTool(loaderDataDef).render(LoaderDataCard)

export const queryCacheClient = defineTool(queryCacheDef).render(QueryCacheCard)
