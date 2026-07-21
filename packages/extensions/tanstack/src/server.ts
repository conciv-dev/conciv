import {defineExtension} from '@conciv/extension'
import {routeTreeServer, routerStateServer} from './tool/server.js'

export const tanstack = defineExtension({name: 'tanstack', tools: [routerStateServer, routeTreeServer]}).server(
  (server) => ({context: {page: server.page}}),
)

export default tanstack
