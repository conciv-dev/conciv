import {defineExtension} from '@conciv/extension'
import {loaderDataServer, routeTreeServer, routerStateServer} from './tool/server.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [routerStateServer, routeTreeServer, loaderDataServer],
}).server((server) => ({context: {page: server.page}}))

export default tanstack
