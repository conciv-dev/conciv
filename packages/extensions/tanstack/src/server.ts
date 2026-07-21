import {defineExtension} from '@conciv/extension'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'
import {readRouteManifest} from './server/route-manifest.js'
import {
  backServer,
  buildErrorsServer,
  loaderDataServer,
  navigateServer,
  queryCacheServer,
  queryInvalidateServer,
  queryRefetchServer,
  routeManifestServer,
  routeTreeServer,
  routerInvalidateServer,
  routerStateServer,
  serverFnTraceServer,
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
    buildErrorsServer,
    routeManifestServer,
    serverFnTraceServer,
  ],
}).server((server) => {
  const ring = makeDiagnosticsRing()
  const serverFnRing = makeServerFnTraceRing()
  const unsubscribe = server.bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
    serverFnRing.observe(diagnostic)
  })
  return {
    context: {
      page: server.page,
      buildErrors: () => ring.list(),
      routeManifest: () => readRouteManifest(server.cwd),
      serverFnTraces: (count?: number) => serverFnRing.traces(count),
      serverFns: () => serverFnRing.functions(),
    },
    dispose: () => unsubscribe?.(),
  }
})

export default tanstack
