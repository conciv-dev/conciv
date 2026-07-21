import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {routerState} from './tool/router-state.js'
import {routeTree} from './tool/route-tree.js'

export const tanstack = defineExtension({name: 'tanstack', tools: [routerState, routeTree]})
  .client(() => ({value: {}, pageVerbs: tanstackVerbs}))
  .server((server) => ({context: {page: server.page}}))

export default tanstack
