import {defineExtension} from '@conciv/extension'
import {
  backServer,
  loaderDataServer,
  navigateServer,
  queryCacheServer,
  queryInvalidateServer,
  queryRefetchServer,
  routeTreeServer,
  routerInvalidateServer,
  routerStateServer,
} from './tool/server.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [
    routerStateServer,
    routeTreeServer,
    loaderDataServer,
    queryCacheServer,
    navigateServer,
    routerInvalidateServer,
    backServer,
    queryInvalidateServer,
    queryRefetchServer,
  ],
}).server((server) => ({context: {page: server.page}}))

export default tanstack
