import {defineTool} from '@conciv/extension'
import {loaderDataDef, routeTreeDef, routerStateDef} from './def.js'
import {LoaderDataCard} from './loader-data-card.js'
import {RouterStateCard} from './router-state-card.js'
import {RouteTreeCard} from './route-tree-card.js'

export const routerStateClient = defineTool(routerStateDef).render(RouterStateCard)

export const routeTreeClient = defineTool(routeTreeDef).render(RouteTreeCard)

export const loaderDataClient = defineTool(loaderDataDef).render(LoaderDataCard)
