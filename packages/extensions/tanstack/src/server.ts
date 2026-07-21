import {defineExtension} from '@conciv/extension'
import {loaderDataServer, queryCacheServer, routeTreeServer, routerStateServer} from './tool/server.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [routerStateServer, routeTreeServer, loaderDataServer, queryCacheServer],
}).server((server) => ({context: {page: server.page}}))

export default tanstack
