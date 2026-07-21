import {defineTool} from '@conciv/extension'
import {routeTreeDef, routerStateDef} from './def.js'
import {RouterStateCard} from './router-state-card.js'
import {RouteTreeCard} from './route-tree-card.js'

export const routerStateClient = defineTool(routerStateDef).render(RouterStateCard)

export const routeTreeClient = defineTool(routeTreeDef).render(RouteTreeCard)
