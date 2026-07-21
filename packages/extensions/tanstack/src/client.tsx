import {defineExtension} from '@conciv/extension'
import {tanstackVerbs} from './client/verbs.js'
import {routeTreeClient, routerStateClient} from './tool/client.js'

export const tanstack = defineExtension({name: 'tanstack', tools: [routerStateClient, routeTreeClient]}).client(() => ({
  value: {},
  pageVerbs: tanstackVerbs,
}))

export default tanstack
